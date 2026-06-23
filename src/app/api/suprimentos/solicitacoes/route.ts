import { AuditAction, Prisma } from "@prisma/client";
import { apiConflict, apiSuccess, apiValidationError, handleApiError } from "@/lib/api/responses";
import { requireApiSession } from "@/lib/auth/guards";
import { makeSupplySequentialCode } from "@/lib/codes/supply-sequence";
import { getPrisma } from "@/lib/db/prisma";
import { serializableTransaction } from "@/lib/db/transactions";
import { purchaseRequestSchema } from "@/lib/validations/purchase";

export async function POST(request: Request) {
  const auth = await requireApiSession({
    permission: "suprimentos.manage",
    forbiddenMessage: "Voce nao tem permissao para criar solicitacoes."
  });
  if (auth.response) return auth.response;
  const { session } = auth;

  const body = await request.json().catch(() => null);
  const parsed = purchaseRequestSchema.safeParse(body);

  if (!parsed.success) {
    return apiValidationError("Revise os campos da solicitacao de compra.", parsed.error.flatten());
  }

  const input = parsed.data;
  const prisma = getPrisma();

  try {
    const requestRecord = await serializableTransaction(prisma, async (tx) => {
      const created = await tx.purchaseRequest.create({
        data: {
          number: await makeSupplySequentialCode(tx, "SC"),
          requesterId: session.userId,
          department: input.department?.trim() || null,
          costCenter: input.costCenter?.trim() || null,
          priority: input.priority,
          neededAt: input.neededAt || null,
          justification: input.justification?.trim() || null,
          items: {
            create: input.items.map((item) => ({
              itemId: item.itemId,
              quantity: new Prisma.Decimal(item.quantity),
              note: item.note?.trim() || null
            }))
          }
        },
        include: {
          requester: true,
          items: {
            include: {
              item: {
                include: {
                  unit: true
                }
              }
            }
          }
        }
      });

      await tx.auditLog.create({
        data: {
          userId: session.userId,
          module: "Suprimentos",
          action: AuditAction.CREATE,
          entity: "PurchaseRequest",
          entityId: created.id,
          newValue: {
            number: created.number,
            priority: created.priority,
            status: created.status,
            itemCount: created.items.length
          }
        }
      });

      return created;
    });

    return apiSuccess({ request: requestRecord }, { status: 201 });
  } catch (error) {
    if (error instanceof Prisma.PrismaClientKnownRequestError && error.code === "P2002") {
      return apiConflict("Ja existe uma solicitacao com este numero.");
    }

    return handleApiError(error, "Nao foi possivel criar a solicitacao.", {
      context: {
        request,
        module: "Suprimentos",
        action: "criar_solicitacao",
        userId: session.userId,
        entity: "PurchaseRequest"
      },
      event: "purchase_request_create_error"
    });
  }
}
