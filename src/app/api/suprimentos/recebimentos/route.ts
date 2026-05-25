import { NextResponse } from "next/server";
import { AuditAction, Prisma, type Warehouse } from "@prisma/client";
import { getSession } from "@/lib/auth/session";
import { makeAutomaticCode, normalizeManualCode } from "@/lib/codes/auto-code";
import { getPrisma } from "@/lib/db/prisma";
import { purchaseReceiptBatchSchema, purchaseReceiptSchema } from "@/lib/validations/purchase";

async function addBalance(
  tx: Prisma.TransactionClient,
  itemId: string,
  warehouseId: string,
  quantity: Prisma.Decimal,
  lotId: string | null
) {
  const currentBalance = await tx.stockBalance.findFirst({
    where: {
      itemId,
      warehouseId,
      lotId
    }
  });

  if (currentBalance) {
    return tx.stockBalance.update({
      where: { id: currentBalance.id },
      data: { quantity: currentBalance.quantity.plus(quantity) }
    });
  }

  return tx.stockBalance.create({
    data: {
      itemId,
      warehouseId,
      lotId,
      quantity
    }
  });
}

function makeReceiptStatus(receivedQuantity: Prisma.Decimal, acceptedQuantity: Prisma.Decimal) {
  return acceptedQuantity.lessThan(receivedQuantity) ? "DIVERGENTE" : "LIBERADO_ESTOQUE";
}

function addDays(date: Date, days: number) {
  const nextDate = new Date(date);
  nextDate.setDate(nextDate.getDate() + days);
  return nextDate;
}

function getPaymentDays(paymentTerms?: string | null) {
  const match = paymentTerms?.match(/(\d{1,3})/);
  return match ? Number(match[1]) : 30;
}

async function updateOrderReceiptStatus(tx: Prisma.TransactionClient, purchaseOrderId: string) {
  const allOrderItems = await tx.purchaseOrderItem.findMany({
    where: { purchaseOrderId },
    include: { receipts: true }
  });

  const everyItemComplete = allOrderItems.every((item) => {
    const accepted = item.receipts.reduce(
      (sum, receiptRow) => sum.plus(receiptRow.acceptedQuantity),
      new Prisma.Decimal(0)
    );
    return accepted.greaterThanOrEqualTo(item.quantity);
  });

  await tx.purchaseOrder.update({
    where: { id: purchaseOrderId },
    data: {
      status: everyItemComplete ? "RECEBIDO" : "PARCIALMENTE_RECEBIDO"
    }
  });
}

async function createPayableFromReceipt(
  tx: Prisma.TransactionClient,
  receipt: {
    id: string;
    number: string;
    invoiceNumber: string | null;
    totalCost: Prisma.Decimal;
    purchaseOrder: {
      number: string;
      supplierId: string;
      paymentTerms: string | null;
    };
    purchaseOrderItem: {
      item: {
        description: string;
      };
    };
  },
  userId: string,
  dueBaseDate: Date
) {
  const payableNumber = receipt.number.replace(/^REC-/, "CP-");
  const dueDate = addDays(dueBaseDate, getPaymentDays(receipt.purchaseOrder.paymentTerms));

  const created = await tx.accountPayable.create({
    data: {
      number: payableNumber,
      purchaseReceiptId: receipt.id,
      supplierId: receipt.purchaseOrder.supplierId,
      createdById: userId,
      description: `NF ${receipt.invoiceNumber || receipt.number} - ${receipt.purchaseOrderItem.item.description}`,
      documentNumber: receipt.invoiceNumber || receipt.number,
      costCenter: "Suprimentos",
      dueDate,
      amount: receipt.totalCost,
      note: `Gerado automaticamente no recebimento do pedido ${receipt.purchaseOrder.number}.`
    }
  });

  await tx.auditLog.create({
    data: {
      userId,
      module: "Financeiro",
      action: AuditAction.CREATE,
      entity: "AccountPayable",
      entityId: created.id,
      newValue: {
        number: created.number,
        documentNumber: created.documentNumber,
        receipt: receipt.number,
        dueDate: created.dueDate.toISOString(),
        amount: created.amount.toString(),
        status: created.status,
        origin: "NF de compra"
      }
    }
  });

  return created;
}

export async function POST(request: Request) {
  const session = await getSession();

  if (!session) {
    return NextResponse.json({ error: "Sessao expirada. Entre novamente." }, { status: 401 });
  }

  if (!session.permissions.includes("suprimentos.manage") || !session.permissions.includes("estoque.move")) {
    return NextResponse.json(
      { error: "Voce precisa de permissao de Suprimentos e Estoque para receber pedido." },
      { status: 403 }
    );
  }

  const body = await request.json().catch(() => null);

  if (body?.purchaseOrderId && Array.isArray(body?.items)) {
    const parsedBatch = purchaseReceiptBatchSchema.safeParse(body);

    if (!parsedBatch.success) {
      return NextResponse.json({ error: "Revise os campos da nota fiscal e dos itens recebidos." }, { status: 400 });
    }

    const input = parsedBatch.data;
    const prisma = getPrisma();

    try {
      const receipts = await prisma.$transaction(async (tx) => {
        const order = await tx.purchaseOrder.findUnique({
          where: { id: input.purchaseOrderId },
          include: {
            supplier: true,
            items: {
              include: {
                item: true,
                receipts: true
              }
            }
          }
        });

        if (!order) {
          throw new Error("ORDER_NOT_FOUND");
        }

        if (order.status === "CANCELADO" || order.status === "RECEBIDO") {
          throw new Error("ORDER_CLOSED");
        }

        const warehouse = await tx.warehouse.findUnique({ where: { id: input.warehouseId } });

        if (!warehouse || !warehouse.active) {
          throw new Error("WAREHOUSE_NOT_FOUND");
        }

        const createdReceipts = [];
        const itemInputs = input.items.filter((item) => item.acceptedQuantity > 0);

        for (const [index, itemInput] of itemInputs.entries()) {
          const orderItem = order.items.find((item) => item.id === itemInput.purchaseOrderItemId);

          if (!orderItem) {
            throw new Error("ORDER_ITEM_NOT_FOUND");
          }

          if (!orderItem.item.controlsStock) {
            throw new Error("ITEM_WITHOUT_STOCK");
          }

          const receivedQuantity = new Prisma.Decimal(itemInput.receivedQuantity);
          const acceptedQuantity = new Prisma.Decimal(itemInput.acceptedQuantity);

          if (acceptedQuantity.greaterThan(receivedQuantity)) {
            throw new Error("ACCEPTED_GREATER_THAN_RECEIVED");
          }

          const alreadyAccepted = orderItem.receipts.reduce(
            (sum, receiptRow) => sum.plus(receiptRow.acceptedQuantity),
            new Prisma.Decimal(0)
          );
          const remainingQuantity = orderItem.quantity.minus(alreadyAccepted);

          if (acceptedQuantity.greaterThan(remainingQuantity)) {
            throw new Error("RECEIPT_EXCEEDS_ORDER");
          }

          let lotId: string | null = null;
          const lotCode = itemInput.lotCode?.trim();

          if (lotCode) {
            const lot = await tx.lot.upsert({
              where: { code: lotCode.toUpperCase() },
              update: {
                supplierId: order.supplierId,
                supplierLot: input.supplierLot?.trim() || null,
                manufacturedAt: itemInput.manufacturedAt || null,
                expiresAt: itemInput.expiresAt || null,
                status: "EM_ANALISE"
              },
              create: {
                code: lotCode.toUpperCase(),
                itemId: orderItem.itemId,
                supplierId: order.supplierId,
                supplierLot: input.supplierLot?.trim() || null,
                manufacturedAt: itemInput.manufacturedAt || null,
                expiresAt: itemInput.expiresAt || null,
                status: "EM_ANALISE"
              }
            });
            lotId = lot.id;
          }

          const unitCost = new Prisma.Decimal(itemInput.unitCost);
          const totalCost = acceptedQuantity.mul(unitCost);
          const receiptNumber = `${(input.receiptPrefix || makeAutomaticCode("REC")).trim().toUpperCase()}-${String(index + 1).padStart(2, "0")}`.slice(0, 40);

          await addBalance(
            tx,
            orderItem.itemId,
            (warehouse as Warehouse).id,
            acceptedQuantity,
            lotId
          );

          const movement = await tx.stockMovement.create({
            data: {
              type: "ENTRADA_COMPRA",
              itemId: orderItem.itemId,
              quantity: acceptedQuantity,
              unitCost,
              totalCost,
              targetWarehouseId: warehouse.id,
              lotId,
              userId: session.userId,
              document: input.invoiceNumber.trim(),
              justification: `Recebimento da NF ${input.invoiceNumber.trim()} - pedido ${order.number}`
            }
          });

          const receiptRecord = await tx.purchaseReceipt.create({
            data: {
              number: receiptNumber,
              purchaseOrderId: order.id,
              purchaseOrderItemId: orderItem.id,
              warehouseId: warehouse.id,
              lotId,
              stockMovementId: movement.id,
              receivedById: session.userId,
              status: makeReceiptStatus(receivedQuantity, acceptedQuantity),
              invoiceNumber: input.invoiceNumber.trim(),
              supplierLot: input.supplierLot?.trim() || null,
              receivedQuantity,
              acceptedQuantity,
              rejectedQuantity: receivedQuantity.minus(acceptedQuantity),
              unitCost,
              totalCost,
              receivedAt: input.receivedAt || new Date(),
              note: [itemInput.note?.trim(), input.note?.trim()].filter(Boolean).join(" | ") || null
            },
            include: {
              purchaseOrder: true,
              purchaseOrderItem: {
                include: {
                  item: true
                }
              },
              warehouse: true,
              lot: true,
              stockMovement: true,
              receivedBy: true
            }
          });

          await createPayableFromReceipt(tx, receiptRecord, session.userId, input.receivedAt || new Date());

          await tx.auditLog.create({
            data: {
              userId: session.userId,
              module: "Suprimentos",
              action: AuditAction.STOCK_MOVE,
              entity: "PurchaseReceipt",
              entityId: receiptRecord.id,
              newValue: {
                number: receiptRecord.number,
                invoiceNumber: receiptRecord.invoiceNumber,
                purchaseOrder: receiptRecord.purchaseOrder.number,
                item: receiptRecord.purchaseOrderItem.item.code,
                acceptedQuantity: receiptRecord.acceptedQuantity.toString(),
                unitCost: receiptRecord.unitCost.toString(),
                warehouse: receiptRecord.warehouse.code,
                lot: receiptRecord.lot?.code,
                stockMovementId: receiptRecord.stockMovementId
              }
            }
          });

          createdReceipts.push(receiptRecord);
        }

        await updateOrderReceiptStatus(tx, order.id);

        return createdReceipts;
      });

      return NextResponse.json({ receipts }, { status: 201 });
    } catch (error) {
      if (error instanceof Prisma.PrismaClientKnownRequestError && error.code === "P2002") {
        return NextResponse.json({ error: "Ja existe recebimento com este codigo interno." }, { status: 409 });
      }

      const messages: Record<string, string> = {
        ORDER_NOT_FOUND: "Pedido nao encontrado.",
        ORDER_ITEM_NOT_FOUND: "Item do pedido nao encontrado.",
        ORDER_CLOSED: "Pedido cancelado ou ja recebido nao pode receber nova conferencia.",
        ITEM_WITHOUT_STOCK: "Item nao controla estoque.",
        WAREHOUSE_NOT_FOUND: "Deposito invalido.",
        ACCEPTED_GREATER_THAN_RECEIVED: "Quantidade aceita nao pode ser maior que a recebida.",
        RECEIPT_EXCEEDS_ORDER: "Quantidade aceita ultrapassa o saldo pendente do pedido."
      };

      const message = error instanceof Error ? messages[error.message] || error.message : "Nao foi possivel registrar a nota fiscal.";

      return NextResponse.json({ error: message }, { status: 400 });
    }
  }

  const parsed = purchaseReceiptSchema.safeParse(body);

  if (!parsed.success) {
    return NextResponse.json({ error: "Revise os campos do recebimento." }, { status: 400 });
  }

  const input = parsed.data;
  const receivedQuantity = new Prisma.Decimal(input.receivedQuantity);
  const acceptedQuantity = new Prisma.Decimal(input.acceptedQuantity);

  if (acceptedQuantity.greaterThan(receivedQuantity)) {
    return NextResponse.json({ error: "Quantidade aceita nao pode ser maior que a recebida." }, { status: 400 });
  }

  const prisma = getPrisma();

  try {
    const receipt = await prisma.$transaction(async (tx) => {
      const orderItem = await tx.purchaseOrderItem.findUnique({
        where: { id: input.purchaseOrderItemId },
        include: {
          item: true,
          purchaseOrder: {
            include: {
              supplier: true
            }
          },
          receipts: true
        }
      });

      if (!orderItem) {
        throw new Error("ORDER_ITEM_NOT_FOUND");
      }

      if (orderItem.purchaseOrder.status === "CANCELADO" || orderItem.purchaseOrder.status === "RECEBIDO") {
        throw new Error("ORDER_CLOSED");
      }

      if (!orderItem.item.controlsStock) {
        throw new Error("ITEM_WITHOUT_STOCK");
      }

      const warehouse = await tx.warehouse.findUnique({ where: { id: input.warehouseId } });

      if (!warehouse || !warehouse.active) {
        throw new Error("WAREHOUSE_NOT_FOUND");
      }

      const alreadyAccepted = orderItem.receipts.reduce(
        (sum, receiptRow) => sum.plus(receiptRow.acceptedQuantity),
        new Prisma.Decimal(0)
      );
      const remainingQuantity = orderItem.quantity.minus(alreadyAccepted);

      if (acceptedQuantity.greaterThan(remainingQuantity)) {
        throw new Error("RECEIPT_EXCEEDS_ORDER");
      }

      let lotId: string | null = null;
      const lotCode = input.lotCode?.trim();

      if (lotCode) {
        const lot = await tx.lot.upsert({
          where: { code: lotCode.toUpperCase() },
          update: {
            supplierId: orderItem.purchaseOrder.supplierId,
            supplierLot: input.supplierLot?.trim() || null,
            manufacturedAt: input.manufacturedAt || null,
            expiresAt: input.expiresAt || null,
            status: "EM_ANALISE"
          },
          create: {
            code: lotCode.toUpperCase(),
            itemId: orderItem.itemId,
            supplierId: orderItem.purchaseOrder.supplierId,
            supplierLot: input.supplierLot?.trim() || null,
            manufacturedAt: input.manufacturedAt || null,
            expiresAt: input.expiresAt || null,
            status: "EM_ANALISE"
          }
        });
        lotId = lot.id;
      }

      const unitCost = orderItem.unitPrice;
      const totalCost = acceptedQuantity.mul(unitCost);
      const receiptNumber = normalizeManualCode(input.number) || makeAutomaticCode("REC");

      await addBalance(
        tx,
        orderItem.itemId,
        (warehouse as Warehouse).id,
        acceptedQuantity,
        lotId
      );

      const movement = await tx.stockMovement.create({
        data: {
          type: "ENTRADA_COMPRA",
          itemId: orderItem.itemId,
          quantity: acceptedQuantity,
          unitCost,
          totalCost,
          targetWarehouseId: warehouse.id,
          lotId,
          userId: session.userId,
          document: input.invoiceNumber?.trim() || receiptNumber,
          justification: `Recebimento do pedido ${orderItem.purchaseOrder.number}`
        }
      });

      const receiptRecord = await tx.purchaseReceipt.create({
        data: {
          number: receiptNumber,
          purchaseOrderId: orderItem.purchaseOrderId,
          purchaseOrderItemId: orderItem.id,
          warehouseId: warehouse.id,
          lotId,
          stockMovementId: movement.id,
          receivedById: session.userId,
          status: makeReceiptStatus(receivedQuantity, acceptedQuantity),
          invoiceNumber: input.invoiceNumber?.trim() || null,
          supplierLot: input.supplierLot?.trim() || null,
          receivedQuantity,
          acceptedQuantity,
          rejectedQuantity: receivedQuantity.minus(acceptedQuantity),
          unitCost,
          totalCost,
          receivedAt: input.receivedAt || new Date(),
          note: input.note?.trim() || null
        },
        include: {
          purchaseOrder: true,
          purchaseOrderItem: {
            include: {
              item: true
            }
          },
          warehouse: true,
          lot: true,
          stockMovement: true,
          receivedBy: true
        }
      });

      await createPayableFromReceipt(tx, receiptRecord, session.userId, input.receivedAt || new Date());

      await updateOrderReceiptStatus(tx, orderItem.purchaseOrderId);

      await tx.auditLog.create({
        data: {
          userId: session.userId,
          module: "Suprimentos",
          action: AuditAction.STOCK_MOVE,
          entity: "PurchaseReceipt",
          entityId: receiptRecord.id,
          newValue: {
            number: receiptRecord.number,
            purchaseOrder: receiptRecord.purchaseOrder.number,
            item: receiptRecord.purchaseOrderItem.item.code,
            acceptedQuantity: receiptRecord.acceptedQuantity.toString(),
            warehouse: receiptRecord.warehouse.code,
            lot: receiptRecord.lot?.code,
            stockMovementId: receiptRecord.stockMovementId
          }
        }
      });

      return receiptRecord;
    });

    return NextResponse.json({ receipt }, { status: 201 });
  } catch (error) {
    if (error instanceof Prisma.PrismaClientKnownRequestError && error.code === "P2002") {
      return NextResponse.json({ error: "Ja existe recebimento com este numero." }, { status: 409 });
    }

    const messages: Record<string, string> = {
      ORDER_ITEM_NOT_FOUND: "Item do pedido nao encontrado.",
      ORDER_CLOSED: "Pedido cancelado ou ja recebido nao pode receber nova conferencia.",
      ITEM_WITHOUT_STOCK: "Item nao controla estoque.",
      WAREHOUSE_NOT_FOUND: "Deposito invalido.",
      RECEIPT_EXCEEDS_ORDER: "Quantidade aceita ultrapassa o saldo pendente do pedido."
    };

    const message = error instanceof Error ? messages[error.message] || error.message : "Nao foi possivel registrar o recebimento.";

    return NextResponse.json({ error: message }, { status: 400 });
  }
}
