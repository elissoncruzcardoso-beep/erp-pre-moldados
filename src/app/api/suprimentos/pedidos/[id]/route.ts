import { AuditAction, Prisma } from "@prisma/client";
import {
  apiConflict,
  apiError,
  apiSuccess,
  apiValidationError,
  handleApiError
} from "@/lib/api/responses";
import { requireApiSession } from "@/lib/auth/guards";
import { getPrisma } from "@/lib/db/prisma";
import { serializableTransaction } from "@/lib/db/transactions";
import { purchaseOrderUpdateSchema } from "@/lib/validations/purchase";

type RouteContext = {
  params: Promise<{ id: string }>;
};

export async function PATCH(request: Request, context: RouteContext) {
  const auth = await requireApiSession({
    permission: "suprimentos.manage",
    forbiddenMessage: "Voce nao tem permissao para editar pedidos."
  });
  if (auth.response) return auth.response;
  const { session } = auth;

  const body = await request.json().catch(() => null);
  const parsed = purchaseOrderUpdateSchema.safeParse(body);

  if (!parsed.success) {
    return apiValidationError("Revise os campos do pedido.", parsed.error.flatten());
  }

  const { id } = await context.params;
  const input = parsed.data;
  const prisma = getPrisma();

  try {
    const order = await serializableTransaction(prisma, async (tx) => {
      const current = await tx.purchaseOrder.findUnique({
        where: { id },
        include: {
          supplier: true,
          items: {
            include: {
              receipts: true
            }
          }
        }
      });

      if (!current) {
        throw new Error("ORDER_NOT_FOUND");
      }

      if (current.items.some((item) => item.receipts.length > 0)) {
        throw new Error("ORDER_HAS_RECEIPTS");
      }

      const currentItemsById = new Map(current.items.map((item) => [item.id, item]));
      const totalItemsValue = input.items.reduce((sum, item) => {
        if (!currentItemsById.has(item.id)) {
          throw new Error("ORDER_ITEM_INVALID");
        }

        return sum.plus(new Prisma.Decimal(item.quantity).mul(new Prisma.Decimal(item.unitPrice)));
      }, new Prisma.Decimal(0));
      const freightCost = new Prisma.Decimal(input.freightCost);

      for (const item of input.items) {
        await tx.purchaseOrderItem.update({
          where: { id: item.id },
          data: {
            quantity: new Prisma.Decimal(item.quantity),
            unitPrice: new Prisma.Decimal(item.unitPrice),
            totalValue: new Prisma.Decimal(item.quantity).mul(new Prisma.Decimal(item.unitPrice)),
            note: item.note?.trim() || null
          }
        });
      }

      const updated = await tx.purchaseOrder.update({
        where: { id: current.id },
        data: {
          status: input.status,
          expectedDeliveryAt: input.expectedDeliveryAt || null,
          paymentTerms: input.paymentTerms?.trim() || null,
          freightCost,
          totalValue: totalItemsValue.plus(freightCost),
          note: input.note?.trim() || null
        },
        include: {
          supplier: true,
          items: true
        }
      });

      await tx.auditLog.create({
        data: {
          userId: session.userId,
          module: "Suprimentos",
          action: AuditAction.UPDATE,
          entity: "PurchaseOrder",
          entityId: updated.id,
          previousValue: {
            number: current.number,
            status: current.status,
            totalValue: current.totalValue.toString()
          },
          newValue: {
            number: updated.number,
            status: updated.status,
            totalValue: updated.totalValue.toString(),
            itemCount: updated.items.length
          }
        }
      });

      return updated;
    });

    return apiSuccess({ order });
  } catch (error) {
    if (error instanceof Error && error.message === "ORDER_NOT_FOUND") {
      return apiError("Pedido nao encontrado.", { status: 404 });
    }

    if (error instanceof Error && error.message === "ORDER_HAS_RECEIPTS") {
      return apiConflict("Pedido com recebimento/nota fiscal nao pode ser editado.");
    }

    if (error instanceof Error && error.message === "ORDER_ITEM_INVALID") {
      return apiValidationError("Item invalido no pedido.");
    }

    if (error instanceof Prisma.PrismaClientKnownRequestError && error.code === "P2002") {
      return apiConflict("Ja existe um pedido com este numero.");
    }

    return handleApiError(error, "Nao foi possivel editar o pedido.", {
      context: {
        request,
        module: "Suprimentos",
        action: "editar_pedido",
        userId: session.userId,
        entity: "PurchaseOrder"
      },
      event: "purchase_order_update_error"
    });
  }
}

export async function DELETE(request: Request, context: RouteContext) {
  const auth = await requireApiSession({
    permission: "suprimentos.manage",
    forbiddenMessage: "Voce nao tem permissao para excluir pedidos."
  });
  if (auth.response) return auth.response;
  const { session } = auth;

  const { id } = await context.params;
  const prisma = getPrisma();

  try {
    await serializableTransaction(prisma, async (tx) => {
      const current = await tx.purchaseOrder.findUnique({
        where: { id },
        include: {
          purchaseQuote: true,
          purchaseRequest: true,
          supplier: true,
          items: {
            include: {
              receipts: true
            }
          }
        }
      });

      if (!current) {
        throw new Error("ORDER_NOT_FOUND");
      }

      if (current.items.some((item) => item.receipts.length > 0)) {
        throw new Error("ORDER_HAS_RECEIPTS");
      }

      await tx.purchaseOrder.delete({
        where: { id: current.id }
      });

      await tx.purchaseRequest.update({
        where: { id: current.purchaseRequestId },
        data: { status: "APROVADA" }
      });

      await tx.auditLog.create({
        data: {
          userId: session.userId,
          module: "Suprimentos",
          action: AuditAction.DELETE,
          entity: "PurchaseOrder",
          entityId: current.id,
          previousValue: {
            number: current.number,
            quote: current.purchaseQuote.number,
            purchaseRequest: current.purchaseRequest.number,
            supplier: current.supplier.name,
            totalValue: current.totalValue.toString()
          }
        }
      });
    });

    return apiSuccess({});
  } catch (error) {
    if (error instanceof Error && error.message === "ORDER_NOT_FOUND") {
      return apiError("Pedido nao encontrado.", { status: 404 });
    }

    if (error instanceof Error && error.message === "ORDER_HAS_RECEIPTS") {
      return apiConflict("Pedido com recebimento/nota fiscal nao pode ser excluido.");
    }

    return handleApiError(error, "Nao foi possivel excluir o pedido.", {
      context: {
        request,
        module: "Suprimentos",
        action: "excluir_pedido",
        userId: session.userId,
        entity: "PurchaseOrder"
      },
      event: "purchase_order_delete_error"
    });
  }
}
