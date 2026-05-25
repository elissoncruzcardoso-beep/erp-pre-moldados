import { NextResponse } from "next/server";
import { AuditAction, Prisma, type Warehouse } from "@prisma/client";
import { getSession } from "@/lib/auth/session";
import { normalizeManualCode } from "@/lib/codes/auto-code";
import { getPrisma } from "@/lib/db/prisma";
import { purchaseReceiptUpdateSchema } from "@/lib/validations/purchase";

type RouteContext = {
  params: Promise<{ id: string }>;
};

async function subtractBalance(
  tx: ReturnType<typeof getPrisma>,
  itemId: string,
  warehouse: Warehouse,
  quantity: Prisma.Decimal,
  lotId: string | null
) {
  const currentBalance = await tx.stockBalance.findFirst({
    where: {
      itemId,
      warehouseId: warehouse.id,
      lotId
    }
  });
  const availableQuantity = currentBalance?.quantity ?? new Prisma.Decimal(0);
  const nextQuantity = availableQuantity.minus(quantity);

  if (!warehouse.allowsNegative && nextQuantity.lessThan(0)) {
    throw new Error("STOCK_INSUFFICIENT");
  }

  if (currentBalance) {
    await tx.stockBalance.update({
      where: { id: currentBalance.id },
      data: { quantity: nextQuantity }
    });
    return;
  }

  await tx.stockBalance.create({
    data: {
      itemId,
      warehouseId: warehouse.id,
      lotId,
      quantity: nextQuantity
    }
  });
}

async function updateOrderStatus(tx: ReturnType<typeof getPrisma>, purchaseOrderId: string) {
  const orderItems = await tx.purchaseOrderItem.findMany({
    where: { purchaseOrderId },
    include: { receipts: true }
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
  const session = await getSession();

  if (!session) {
    return NextResponse.json({ error: "Sessao expirada. Entre novamente." }, { status: 401 });
  }

  if (!session.permissions.includes("suprimentos.manage")) {
    return NextResponse.json({ error: "Voce nao tem permissao para editar notas fiscais." }, { status: 403 });
  }

  const body = await request.json().catch(() => null);
  const parsed = purchaseReceiptUpdateSchema.safeParse(body);

  if (!parsed.success) {
    return NextResponse.json({ error: "Revise os campos da nota fiscal." }, { status: 400 });
  }

  const { id } = await context.params;
  const input = parsed.data;
  const prisma = getPrisma();

  try {
    const receipt = await prisma.$transaction(async (tx) => {
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

    return NextResponse.json({ receipt });
  } catch (error) {
    if (error instanceof Error && error.message === "RECEIPT_NOT_FOUND") {
      return NextResponse.json({ error: "Nota fiscal/recebimento nao encontrado." }, { status: 404 });
    }

    if (error instanceof Error && error.message === "RECEIPT_HAS_PAYABLE") {
      return NextResponse.json({ error: "Nota fiscal com conta a pagar nao pode ser editada." }, { status: 409 });
    }

    if (error instanceof Prisma.PrismaClientKnownRequestError && error.code === "P2002") {
      return NextResponse.json({ error: "Ja existe recebimento com este numero." }, { status: 409 });
    }

    return NextResponse.json({ error: "Nao foi possivel editar a nota fiscal." }, { status: 500 });
  }
}

export async function DELETE(_request: Request, context: RouteContext) {
  const session = await getSession();

  if (!session) {
    return NextResponse.json({ error: "Sessao expirada. Entre novamente." }, { status: 401 });
  }

  if (!session.permissions.includes("suprimentos.manage") || !session.permissions.includes("estoque.move")) {
    return NextResponse.json({ error: "Voce precisa de permissao de Suprimentos e Estoque para excluir nota fiscal." }, { status: 403 });
  }

  const { id } = await context.params;
  const prisma = getPrisma();

  try {
    await prisma.$transaction(async (tx) => {
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

      await subtractBalance(
        tx as ReturnType<typeof getPrisma>,
        current.purchaseOrderItem.itemId,
        current.warehouse as Warehouse,
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

      await updateOrderStatus(tx as ReturnType<typeof getPrisma>, current.purchaseOrderId);

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

    return NextResponse.json({ ok: true });
  } catch (error) {
    if (error instanceof Error && error.message === "RECEIPT_NOT_FOUND") {
      return NextResponse.json({ error: "Nota fiscal/recebimento nao encontrado." }, { status: 404 });
    }

    if (error instanceof Error && error.message === "RECEIPT_HAS_PAYABLE") {
      return NextResponse.json({ error: "Nota fiscal com conta a pagar nao pode ser excluida." }, { status: 409 });
    }

    if (error instanceof Error && error.message === "STOCK_INSUFFICIENT") {
      return NextResponse.json({ error: "Saldo insuficiente para estornar esta nota fiscal." }, { status: 409 });
    }

    return NextResponse.json({ error: "Nao foi possivel excluir a nota fiscal." }, { status: 500 });
  }
}
