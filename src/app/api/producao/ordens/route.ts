import { AuditAction, Prisma } from "@prisma/client";
import { apiConflict, apiSuccess, apiValidationError, handleApiError } from "@/lib/api/responses";
import { requireApiSession } from "@/lib/auth/guards";
import { makeAutomaticCode, normalizeManualCode } from "@/lib/codes/auto-code";
import { getPrisma } from "@/lib/db/prisma";
import { serializableTransaction } from "@/lib/db/transactions";
import { productionOrderSchema } from "@/lib/validations/production";

const defaultStages = [
  { name: "Preparacao", sequence: 1 },
  { name: "Armacao", sequence: 2 },
  { name: "Concretagem", sequence: 3 },
  { name: "Cura/Qualidade", sequence: 4 },
  { name: "Liberacao", sequence: 5 }
];

export async function POST(request: Request) {
  const auth = await requireApiSession({
    permission: "producao.manage",
    forbiddenMessage: "Voce nao tem permissao para criar ordens de producao."
  });

  if (auth.response) return auth.response;

  const body = await request.json().catch(() => null);
  const parsed = productionOrderSchema.safeParse(body);

  if (!parsed.success) {
    return apiValidationError("Revise os campos obrigatorios da OP.", parsed.error.flatten());
  }

  const prisma = getPrisma();
  const input = parsed.data;

  try {
    const order = await serializableTransaction(prisma, async (tx) => {
      if (input.compositionId) {
        const composition = await tx.composition.findUnique({
          where: { id: input.compositionId },
          select: {
            productId: true,
            approved: true,
            code: true
          }
        });

        if (!composition || composition.productId !== input.productId) {
          throw new Error("A ficha tecnica selecionada nao pertence ao produto da OP.");
        }

        if (!composition.approved) {
          throw new Error(`A ficha tecnica ${composition.code} ainda nao esta aprovada.`);
        }
      }

      const createdOrder = await tx.productionOrder.create({
        data: {
          number: normalizeManualCode(input.number) || makeAutomaticCode("OP"),
          productId: input.productId,
          compositionId: input.compositionId || null,
          moldId: input.moldId || null,
          customerId: input.customerId || null,
          plannedQuantity: new Prisma.Decimal(input.plannedQuantity),
          expectedDate: input.expectedDate || null,
          status: "PLANEJADA",
          stages: {
            create: defaultStages.map((stage) => ({
              name: stage.name,
              sequence: stage.sequence,
              status: stage.sequence === 1 ? "EM_ANDAMENTO" : "PENDENTE",
              startedAt: stage.sequence === 1 ? new Date() : null
            }))
          }
        },
        include: {
          product: true,
          mold: true,
          stages: true
        }
      });

      await tx.auditLog.create({
        data: {
          userId: auth.session.userId,
          module: "Producao",
          action: AuditAction.CREATE,
          entity: "ProductionOrder",
          entityId: createdOrder.id,
          newValue: {
            number: createdOrder.number,
            productId: createdOrder.productId,
            plannedQuantity: createdOrder.plannedQuantity.toString(),
            status: createdOrder.status
          }
        }
      });

      return createdOrder;
    });

    return apiSuccess({ order }, { status: 201 });
  } catch (error) {
    if (error instanceof Prisma.PrismaClientKnownRequestError && error.code === "P2002") {
      return apiConflict("Ja existe uma OP com este numero.");
    }

    const rawMessage = error instanceof Error ? error.message : "";
    const message =
      rawMessage === "A ficha tecnica selecionada nao pertence ao produto da OP." ||
      rawMessage.startsWith("A ficha tecnica ")
        ? rawMessage
        : "Nao foi possivel criar a ordem de producao.";
    return handleApiError(error, message, {
      context: {
        request,
        module: "Producao",
        action: "criar_ordem",
        userId: auth.session.userId,
        entity: "ProductionOrder"
      },
      event: "production_order_error"
    });
  }
}
