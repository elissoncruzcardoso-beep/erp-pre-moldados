import { AuditAction, Prisma } from "@prisma/client";
import { apiConflict, apiError, apiForbidden, apiSuccess, apiUnauthorized, apiValidationError } from "@/lib/api/responses";
import { getSession } from "@/lib/auth/session";
import { makeSupplySequentialCode } from "@/lib/codes/supply-sequence";
import { getPrisma } from "@/lib/db/prisma";
import { purchaseRequestSchema } from "@/lib/validations/purchase";

export async function POST(request: Request) {
  const session = await getSession();

  if (!session) {
    return apiUnauthorized();
  }

  if (!session.permissions.includes("suprimentos.manage")) {
    return apiForbidden("Voce nao tem permissao para criar solicitacoes.");
  }

  const body = await request.json().catch(() => null);
  const parsed = purchaseRequestSchema.safeParse(body);

  if (!parsed.success) {
    return apiValidationError("Revise os campos da solicitacao de compra.", parsed.error.flatten());
  }

  const input = parsed.data;
  const prisma = getPrisma();

  try {
    const requestRecord = await prisma.$transaction(async (tx) => {
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

    return apiError("Nao foi possivel criar a solicitacao.", { status: 500 });
  }
}
