import { NextResponse } from "next/server";
import { AuditAction, Prisma } from "@prisma/client";
import { getSession } from "@/lib/auth/session";
import { getPrisma } from "@/lib/db/prisma";
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
  const session = await getSession();

  if (!session) {
    return NextResponse.json({ error: "Sessao expirada. Entre novamente." }, { status: 401 });
  }

  if (!session.permissions.includes("producao.manage")) {
    return NextResponse.json({ error: "Voce nao tem permissao para registrar diario de producao." }, { status: 403 });
  }

  const body = await request.json().catch(() => null);
  const parsed = productionDailyLogSchema.safeParse(body);

  if (!parsed.success) {
    return NextResponse.json({ error: "Revise os campos do diario de producao." }, { status: 400 });
  }

  const input = parsed.data;
  const prisma = getPrisma();

  try {
    const result = await prisma.$transaction(async (tx) => {
      const productIds = input.items.map((item) => item.itemId);
      const products = await tx.item.findMany({
        where: {
          id: { in: productIds },
          active: true,
          type: { in: ["PECA_PRE_MOLDADA", "PRODUTO_ACABADO"] }
        },
        select: { id: true, curingHours: true }
      });
      const productsById = new Map(products.map((product) => [product.id, product]));
      const approvedCompositions = await tx.composition.findMany({
        where: {
          productId: { in: productIds },
          approved: true
        },
        select: {
          productId: true,
          curingHours: true,
          updatedAt: true,
          code: true
        },
        orderBy: [{ updatedAt: "desc" }, { code: "asc" }]
      });
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
          createdById: session.userId,
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
          userId: session.userId,
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
          userId: session.userId,
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

    return NextResponse.json({ dailyLog: result }, { status: 201 });
  } catch (error) {
    if (error instanceof Prisma.PrismaClientKnownRequestError && error.code === "P2002") {
      return NextResponse.json(
        { error: "Ja existe um diario de producao seu para esta data." },
        { status: 409 }
      );
    }

    const message = error instanceof Error ? error.message : "Nao foi possivel registrar o diario de producao.";
    return NextResponse.json({ error: message }, { status: 400 });
  }
}
