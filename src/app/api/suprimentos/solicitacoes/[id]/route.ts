import { AuditAction, Prisma } from "@prisma/client";
import { apiConflict, apiError, apiSuccess, apiValidationError, handleApiError } from "@/lib/api/responses";
import { requireApiSession } from "@/lib/auth/guards";
import { getPrisma } from "@/lib/db/prisma";
import { serializableTransaction } from "@/lib/db/transactions";
import { purchaseRequestSchema } from "@/lib/validations/purchase";

type RouteContext = {
  params: Promise<{ id: string }>;
};

function isRequestStatusLocked(status: string) {
  return status === "EM_COTACAO" || status === "CONVERTIDA_PEDIDO" || status === "CANCELADA";
}

export async function PATCH(request: Request, context: RouteContext) {
  const auth = await requireApiSession({
    permission: "suprimentos.manage",
    forbiddenMessage: "Voce nao tem permissao para editar solicitacoes."
  });
  if (auth.response) return auth.response;
  const { session } = auth;

  const body = await request.json().catch(() => null);
  const parsed = purchaseRequestSchema.safeParse(body);

  if (!parsed.success) {
    return apiValidationError("Revise os campos da solicitacao de compra.", parsed.error.flatten());
  }

  const { id } = await context.params;
  const input = parsed.data;
  const prisma = getPrisma();

  try {
    const requestRecord = await serializableTransaction(prisma, async (tx) => {
      const current = await tx.purchaseRequest.findUnique({
        where: { id },
        include: {
          items: true,
          quotes: true,
          orders: true
        }
      });

      if (!current) {
        throw new Error("REQUEST_NOT_FOUND");
      }

      if (current.quotes.length > 0 || current.orders.length > 0 || isRequestStatusLocked(current.status)) {
        throw new Error("REQUEST_LOCKED");
      }

      await tx.purchaseRequestItem.deleteMany({
        where: { purchaseRequestId: current.id }
      });

      const updated = await tx.purchaseRequest.update({
        where: { id: current.id },
        data: {
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
          items: true
        }
      });

      await tx.auditLog.create({
        data: {
          userId: session.userId,
          module: "Suprimentos",
          action: AuditAction.UPDATE,
          entity: "PurchaseRequest",
          entityId: updated.id,
          previousValue: {
            number: current.number,
            priority: current.priority,
            itemCount: current.items.length
          },
          newValue: {
            number: updated.number,
            priority: updated.priority,
            itemCount: updated.items.length
          }
        }
      });

      return updated;
    });

    return apiSuccess({ request: requestRecord });
  } catch (error) {
    if (error instanceof Error && error.message === "REQUEST_NOT_FOUND") {
      return apiError("Solicitacao nao encontrada.", { status: 404 });
    }

    if (error instanceof Error && error.message === "REQUEST_LOCKED") {
      return apiConflict("Solicitacao com cotacao ou pedido nao pode ser editada.");
    }

    if (error instanceof Prisma.PrismaClientKnownRequestError && error.code === "P2002") {
      return apiConflict("Ja existe uma solicitacao com este numero.");
    }

    return handleApiError(error, "Nao foi possivel editar a solicitacao.", {
      context: {
        request,
        module: "Suprimentos",
        action: "editar_solicitacao",
        userId: session.userId,
        entity: "PurchaseRequest"
      },
      event: "purchase_request_update_error"
    });
  }
}

export async function DELETE(request: Request, context: RouteContext) {
  const auth = await requireApiSession({
    permission: "suprimentos.manage",
    forbiddenMessage: "Voce nao tem permissao para excluir solicitacoes."
  });
  if (auth.response) return auth.response;
  const { session } = auth;

  const { id } = await context.params;
  const prisma = getPrisma();

  try {
    await serializableTransaction(prisma, async (tx) => {
      const current = await tx.purchaseRequest.findUnique({
        where: { id },
        include: {
          items: true,
          quotes: true,
          orders: true
        }
      });

      if (!current) {
        throw new Error("REQUEST_NOT_FOUND");
      }

      if (current.quotes.length > 0 || current.orders.length > 0 || isRequestStatusLocked(current.status)) {
        throw new Error("REQUEST_LOCKED");
      }

      await tx.purchaseRequest.delete({
        where: { id: current.id }
      });

      await tx.auditLog.create({
        data: {
          userId: session.userId,
          module: "Suprimentos",
          action: AuditAction.DELETE,
          entity: "PurchaseRequest",
          entityId: current.id,
          previousValue: {
            number: current.number,
            priority: current.priority,
            status: current.status,
            itemCount: current.items.length
          }
        }
      });
    });

    return apiSuccess({});
  } catch (error) {
    if (error instanceof Error && error.message === "REQUEST_NOT_FOUND") {
      return apiError("Solicitacao nao encontrada.", { status: 404 });
    }

    if (error instanceof Error && error.message === "REQUEST_LOCKED") {
      return apiConflict("Solicitacao com cotacao ou pedido nao pode ser excluida.");
    }

    return handleApiError(error, "Nao foi possivel excluir a solicitacao.", {
      context: {
        request,
        module: "Suprimentos",
        action: "excluir_solicitacao",
        userId: session.userId,
        entity: "PurchaseRequest"
      },
      event: "purchase_request_delete_error"
    });
  }
}
