import { AuditAction, Prisma } from "@prisma/client";
import {
  apiConflict,
  apiError,
  apiSuccess,
  apiValidationError,
  handleApiError
} from "@/lib/api/responses";
import { requireApiSession } from "@/lib/auth/guards";
import { normalizeManualCode } from "@/lib/codes/auto-code";
import { getPrisma } from "@/lib/db/prisma";
import { serializableTransaction } from "@/lib/db/transactions";
import { decreaseStockBalance } from "@/lib/stock/transactions";
import { purchaseReceiptUpdateSchema } from "@/lib/validations/purchase";

type RouteContext = {
  params: Promise<{ id: string }>;
};

async function updateOrderStatus(tx: Prisma.TransactionClient, purchaseOrderId: string) {
  const orderItems = await tx.purchaseOrderItem.findMany({
    where: { purchaseOrderId },
    include: { receipts: true },
    take: 500
  });
  const hasAnyReceipt = orderItems.some((item) => item.receipts.length > 0);
  const everyItemComplete = orderItems.length > 0 && orderItems.every((item) => {
    const accepted = item.receipts.reduce(
      (sum, receipt) => sum.plus(receipt.acceptedQuantity),
      new Prisma.Decimal(0)
    );
    return accepted.greaterThanOrEqualTo(item.quantity);
  });

  await tx.purchaseOrder.update({
    where: { id: purchaseOrderId },
    data: {
      status: everyItemComplete ? "RECEBIDO" : hasAnyReceipt ? "PARCIALMENTE_RECEBIDO" : "EMITIDO"
    }
  });
}

export async function PATCH(request: Request, context: RouteContext) {
  const auth = await requireApiSession({
    permission: "suprimentos.manage",
    forbiddenMessage: "Voce nao tem permissao para editar notas fiscais."
  });
  if (auth.response) return auth.response;
  const { session } = auth;

  const body = await request.json().catch(() => null);
  const parsed = purchaseReceiptUpdateSchema.safeParse(body);

  if (!parsed.success) {
    return apiValidationError("Revise os campos da nota fiscal.", parsed.error.flatten());
  }

  const { id } = await context.params;
  const input = parsed.data;
  const prisma = getPrisma();

  try {
    const receipt = await serializableTransaction(prisma, async (tx) => {
      const current = await tx.purchaseReceipt.findUnique({
        where: { id },
        include: {
          accountPayable: true,
          purchaseOrder: true,
          purchaseOrderItem: {
            include: {
              item: true
            }
          }
        }
      });

      if (!current) {
        throw new Error("RECEIPT_NOT_FOUND");
      }

      if (current.accountPayable) {
        throw new Error("RECEIPT_HAS_PAYABLE");
      }

      const updated = await tx.purchaseReceipt.update({
        where: { id: current.id },
        data: {
          number: normalizeManualCode(input.number) || current.number,
          invoiceNumber: input.invoiceNumber?.trim() || null,
          supplierLot: input.supplierLot?.trim() || null,
          receivedAt: input.receivedAt || current.receivedAt,
          note: input.note?.trim() || null
        }
      });

      if (current.stockMovementId) {
        await tx.stockMovement.update({
          where: { id: current.stockMovementId },
          data: {
            document: input.invoiceNumber?.trim() || normalizeManualCode(input.number) || current.number
          }
        });
      }

      await tx.auditLog.create({
        data: {
          userId: session.userId,
          module: "Suprimentos",
          action: AuditAction.UPDATE,
          entity: "PurchaseReceipt",
          entityId: updated.id,
          previousValue: {
            number: current.number,
            invoiceNumber: current.invoiceNumber
          },
          newValue: {
            number: updated.number,
            invoiceNumber: updated.invoiceNumber
          }
        }
      });

      return updated;
    });

    return apiSuccess({ receipt });
  } catch (error) {
    if (error instanceof Error && error.message === "RECEIPT_NOT_FOUND") {
      return apiError("Nota fiscal/recebimento nao encontrado.", { status: 404 });
    }

    if (error instanceof Error && error.message === "RECEIPT_HAS_PAYABLE") {
      return apiConflict("Nota fiscal com conta a pagar nao pode ser editada.");
    }

    if (error instanceof Prisma.PrismaClientKnownRequestError && error.code === "P2002") {
      return apiConflict("Ja existe recebimento com este numero.");
    }

    return handleApiError(error, "Nao foi possivel editar a nota fiscal.", {
      context: {
        request,
        module: "Suprimentos",
        action: "editar_nota_fiscal_compra",
        userId: session.userId,
        entity: "PurchaseReceipt"
      },
      event: "purchase_receipt_update_error"
    });
  }
}

export async function DELETE(request: Request, context: RouteContext) {
  const auth = await requireApiSession({
    permissions: ["suprimentos.manage", "estoque.move"],
    forbiddenMessage: "Voce precisa de permissao de Suprimentos e Estoque para excluir nota fiscal."
  });
  if (auth.response) return auth.response;
  const { session } = auth;

  const { id } = await context.params;
  const prisma = getPrisma();

  try {
    await serializableTransaction(prisma, async (tx) => {
      const current = await tx.purchaseReceipt.findUnique({
        where: { id },
        include: {
          accountPayable: true,
          warehouse: true,
          purchaseOrder: true,
          purchaseOrderItem: {
            include: {
              item: true
            }
          }
        }
      });

      if (!current) {
        throw new Error("RECEIPT_NOT_FOUND");
      }

      if (current.accountPayable) {
        throw new Error("RECEIPT_HAS_PAYABLE");
      }

      await decreaseStockBalance(
        tx,
        current.purchaseOrderItem.itemId,
        current.warehouse,
        current.acceptedQuantity,
        current.lotId
      );

      await tx.stockMovement.create({
        data: {
          type: "AJUSTE_NEGATIVO",
          itemId: current.purchaseOrderItem.itemId,
          quantity: current.acceptedQuantity,
          unitCost: current.unitCost,
          totalCost: current.totalCost,
          originWarehouseId: current.warehouseId,
          lotId: current.lotId,
          userId: session.userId,
          document: current.invoiceNumber || current.number,
          justification: `Estorno da nota fiscal ${current.number}`
        }
      });

      await tx.purchaseReceipt.delete({
        where: { id: current.id }
      });

      await updateOrderStatus(tx, current.purchaseOrderId);

      await tx.auditLog.create({
        data: {
          userId: session.userId,
          module: "Suprimentos",
          action: AuditAction.STOCK_REVERSAL,
          entity: "PurchaseReceipt",
          entityId: current.id,
          previousValue: {
            number: current.number,
            purchaseOrder: current.purchaseOrder.number,
            item: current.purchaseOrderItem.item.code,
            acceptedQuantity: current.acceptedQuantity.toString(),
            warehouse: current.warehouse.code
          },
          justification: "Exclusao de nota fiscal com estorno de estoque"
        }
      });
    });

    return apiSuccess({});
  } catch (error) {
    if (error instanceof Error && error.message === "RECEIPT_NOT_FOUND") {
      return apiError("Nota fiscal/recebimento nao encontrado.", { status: 404 });
    }

    if (error instanceof Error && error.message === "RECEIPT_HAS_PAYABLE") {
      return apiConflict("Nota fiscal com conta a pagar nao pode ser excluida.");
    }

    if (error instanceof Error && error.message === "STOCK_INSUFFICIENT") {
      return apiConflict("Saldo insuficiente para estornar esta nota fiscal.");
    }

    return handleApiError(error, "Nao foi possivel excluir a nota fiscal.", {
      context: {
        request,
        module: "Suprimentos",
        action: "excluir_nota_fiscal_compra",
        userId: session.userId,
        entity: "PurchaseReceipt"
      },
      event: "purchase_receipt_delete_error"
    });
  }
}
