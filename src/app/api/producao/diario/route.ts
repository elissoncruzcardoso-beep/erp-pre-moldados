import { AuditAction, Prisma } from "@prisma/client";
import { apiConflict, apiSuccess, apiValidationError, handleApiError } from "@/lib/api/responses";
import { requireApiSession } from "@/lib/auth/guards";
import { getPrisma } from "@/lib/db/prisma";
import { serializableTransaction } from "@/lib/db/transactions";
import { calculateBatchReadyAt } from "@/lib/production/auto-release-cured-batches";
import { consumeApprovedCompositionForProduction } from "@/lib/production/consume-composition";
import { productionDailyLogSchema } from "@/lib/validations/production";

function normalizeDateOnly(value: Date) {
  return new Date(Date.UTC(value.getUTCFullYear(), value.getUTCMonth(), value.getUTCDate()));
}

function buildBatchCode(logDate: Date, sequence: number) {
  const stamp = logDate.toISOString().slice(0, 10).replace(/-/g, "");
  return `LOTE-${stamp}-${String(sequence).padStart(3, "0")}`;
}

export async function POST(request: Request) {
  const auth = await requireApiSession({
    permission: "producao.manage",
    forbiddenMessage: "Voce nao tem permissao para registrar diario de producao."
  });

  if (auth.response) return auth.response;

  const body = await request.json().catch(() => null);
  const parsed = productionDailyLogSchema.safeParse(body);

  if (!parsed.success) {
    return apiValidationError("Revise os campos do diario de producao.", parsed.error.flatten());
  }

  const input = parsed.data;
  const prisma = getPrisma();

  try {
    const result = await serializableTransaction(prisma, async (tx) => {
      const productIds = input.items.map((item) => item.itemId);
      const products = await tx.item.findMany({
        where: {
          id: { in: productIds },
          active: true,
          type: { in: ["PECA_PRE_MOLDADA", "PRODUTO_ACABADO"] }
        },
        select: { id: true, curingHours: true },
        take: productIds.length
      });
      const productsById = new Map(products.map((product) => [product.id, product]));
      const approvedCompositions = (await Promise.all(
        Array.from(new Set(productIds)).map((productId) =>
          tx.composition.findFirst({
            where: {
              productId,
              approved: true
            },
            select: {
              productId: true,
              curingHours: true
            },
            orderBy: [{ updatedAt: "desc" }, { code: "asc" }]
          })
        )
      )).filter((composition) => composition !== null);
      const compositionsByProductId = new Map<string, { curingHours: number | null }>();

      for (const composition of approvedCompositions) {
        if (!compositionsByProductId.has(composition.productId)) {
          compositionsByProductId.set(composition.productId, composition);
        }
      }

      if (products.length !== new Set(productIds).size) {
        throw new Error("Uma ou mais pecas selecionadas nao estao disponiveis para producao.");
      }

      const logDate = normalizeDateOnly(input.logDate);
      const existingBatches = await tx.productionBatch.count({
        where: { producedAt: logDate }
      });
      const log = await tx.productionDailyLog.create({
        data: {
          logDate,
          teamPresent: input.teamPresent.trim(),
          weatherMorning: input.weatherMorning.trim(),
          weatherAfternoon: input.weatherAfternoon.trim(),
          observation: input.observation?.trim() || null,
          createdById: auth.session.userId,
          items: {
            create: input.items.map((item) => ({
              itemId: item.itemId,
              quantity: new Prisma.Decimal(item.quantity),
              note: item.note?.trim() || null
            }))
          }
        },
        include: {
          items: {
            include: {
              item: true
            }
          }
        }
      });

      const consumptionSummaries = [];

      for (const [index, item] of log.items.entries()) {
        const quantity = new Prisma.Decimal(item.quantity);
        const sequence = existingBatches + index + 1;
        const batchCode = buildBatchCode(logDate, sequence);
        const product = productsById.get(item.itemId);
        const composition = compositionsByProductId.get(item.itemId);
        const effectiveCuringHours = composition?.curingHours ?? product?.curingHours ?? 24;
        const readyAt = calculateBatchReadyAt(logDate, effectiveCuringHours);

        await tx.productionBatch.create({
          data: {
            code: batchCode,
            dailyLogItemId: item.id,
            itemId: item.itemId,
            producedQuantity: quantity,
            curingQuantity: quantity,
            producedAt: logDate,
            readyAt
          }
        });

        const consumptionSummary = await consumeApprovedCompositionForProduction(tx, {
          productId: item.itemId,
          producedQuantity: quantity,
          userId: auth.session.userId,
          document: batchCode,
          justification: `Consumo automatico pela ficha tecnica no Diario de Producao ${log.logDate.toLocaleDateString("pt-BR")}.`
        });

        if (consumptionSummary) {
          consumptionSummaries.push({
            batchCode,
            ...consumptionSummary
          });
        }
      }

      await tx.auditLog.create({
        data: {
          userId: auth.session.userId,
          module: "Producao",
          action: AuditAction.CREATE,
          entity: "ProductionDailyLog",
          entityId: log.id,
          newValue: {
            logDate: log.logDate.toISOString(),
            teamPresent: log.teamPresent,
            weatherMorning: log.weatherMorning,
            weatherAfternoon: log.weatherAfternoon,
            items: log.items.map((item) => ({
              itemId: item.itemId,
              quantity: item.quantity.toString(),
              batchCode: buildBatchCode(log.logDate, existingBatches + log.items.findIndex((logItem) => logItem.id === item.id) + 1),
              curingHours: compositionsByProductId.get(item.itemId)?.curingHours ?? productsById.get(item.itemId)?.curingHours ?? 24,
              readyAt: calculateBatchReadyAt(logDate, compositionsByProductId.get(item.itemId)?.curingHours ?? productsById.get(item.itemId)?.curingHours ?? 24).toISOString()
            })),
            compositionConsumption: consumptionSummaries
          }
        }
      });

      return log;
    });

    return apiSuccess({ dailyLog: result }, { status: 201 });
  } catch (error) {
    if (error instanceof Prisma.PrismaClientKnownRequestError && error.code === "P2002") {
      return apiConflict("Ja existe um diario de producao seu para esta data.");
    }

    const rawMessage = error instanceof Error ? error.message : "";
    const message = rawMessage.includes("Transaction not found") || rawMessage.includes("Transaction API error")
      ? "Nao foi possivel concluir o diario porque a operacao demorou mais que o esperado. Tente salvar novamente; se repetir, revise se a ficha tecnica possui muitos insumos ou se o banco esta lento."
      : rawMessage === "Uma ou mais pecas selecionadas nao estao disponiveis para producao."
        ? rawMessage
        : rawMessage.startsWith("Saldo insuficiente.")
          ? "Saldo insuficiente para baixar os insumos da ficha tecnica."
          : "Nao foi possivel registrar o diario de producao.";
    return handleApiError(error, message, {
      context: {
        request,
        module: "Producao",
        action: "registrar_diario",
        userId: auth.session.userId,
        entity: "ProductionDailyLog"
      },
      event: "production_daily_log_error"
    });
  }
}
