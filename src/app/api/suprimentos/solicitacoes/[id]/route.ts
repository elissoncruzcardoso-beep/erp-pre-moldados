import { AuditAction, Prisma } from "@prisma/client";
import { apiConflict, apiError, apiForbidden, apiSuccess, apiUnauthorized, apiValidationError } from "@/lib/api/responses";
import { getSession } from "@/lib/auth/session";
import { getPrisma } from "@/lib/db/prisma";
import { purchaseRequestSchema } from "@/lib/validations/purchase";

type RouteContext = {
  params: Promise<{ id: string }>;
};

export async function PATCH(request: Request, context: RouteContext) {
  const session = await getSession();

  if (!session) {
    return apiUnauthorized();
  }

  if (!session.permissions.includes("suprimentos.manage")) {
    return apiForbidden("Voce nao tem permissao para editar solicitacoes.");
  }

  const body = await request.json().catch(() => null);
  const parsed = purchaseRequestSchema.safeParse(body);

  if (!parsed.success) {
    return apiValidationError("Revise os campos da solicitacao de compra.", parsed.error.flatten());
  }

  const { id } = await context.params;
  const input = parsed.data;
  const prisma = getPrisma();

  try {
    const requestRecord = await prisma.$transaction(async (tx) => {
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

      if (current.quotes.length > 0 || current.orders.length > 0 || current.status !== "ABERTA") {
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

    return apiError("Nao foi possivel editar a solicitacao.", { status: 500 });
  }
}

export async function DELETE(_request: Request, context: RouteContext) {
  const session = await getSession();

  if (!session) {
    return apiUnauthorized();
  }

  if (!session.permissions.includes("suprimentos.manage")) {
    return apiForbidden("Voce nao tem permissao para excluir solicitacoes.");
  }

  const { id } = await context.params;
  const prisma = getPrisma();

  try {
    await prisma.$transaction(async (tx) => {
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

      if (current.quotes.length > 0 || current.orders.length > 0 || current.status !== "ABERTA") {
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

    return apiError("Nao foi possivel excluir a solicitacao.", { status: 500 });
  }
}
