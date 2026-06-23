import { AuditAction, Prisma, type PrismaClient } from "@prisma/client";
import { makeAutomaticCode } from "@/lib/codes/auto-code";
import { serializableTransaction } from "@/lib/db/transactions";
import { consumeStockFromWarehouse, increaseStockBalance, toDecimal } from "@/lib/stock/transactions";
import type { SaleItemInput, StockSaleInput } from "@/lib/validations/sales";
import { parseSaleLines } from "./parse-sale-lines";

type SaleLineInput = SaleItemInput;

type SaleLineSnapshot = {
  itemId: string;
  itemCode: string;
  description: string;
  unitCode: string;
  warehouseId: string;
  warehouse: string;
  quantity: string;
  unitPrice: string;
  grossTotal: string;
  discount: string;
  finalTotal: string;
  movementId: string;
  consumedLots: Array<{ lotId: string | null; lotCode: string; quantity: string }>;
};

type DirectSaleSession = {
  userId: string;
};

type ConsumedLot = {
  lotId: string | null;
  lotCode: string;
  quantity: string;
};

type RestockLine = {
  itemId: string;
  warehouseId: string;
  quantity: string;
  unitPrice: string;
  finalTotal: string;
  consumedLots: ConsumedLot[];
};

type DirectSaleReceiptSource = {
  id: string;
  number: string;
  issuedAt: Date;
  customerName: string;
  customerDocument: string | null;
  paymentMethod: string | null;
  note: string | null;
  quantity: Prisma.Decimal;
  unitPrice: Prisma.Decimal;
  grossTotal: Prisma.Decimal;
  discount: Prisma.Decimal;
  finalTotal: Prisma.Decimal;
  consumedLots?: Prisma.JsonValue | null;
  accountReceivable?: {
    number: string;
    status: string;
    dueDate: Date;
    receivedAmount: Prisma.Decimal;
  } | null;
  createdBy: { name: string };
  warehouse: { code: string; name: string };
  item: { id: string; code: string; description: string; unit: { code: string } };
};

function formatReceiptDate(value: Date) {
  return value.toLocaleString("pt-BR", {
    dateStyle: "short",
    timeStyle: "short"
  });
}

export function buildDirectSaleLines(input: StockSaleInput): SaleLineInput[] {
  return input.items && input.items.length > 0
    ? input.items
    : [
        {
          itemId: input.itemId,
          warehouseId: input.warehouseId,
          quantity: input.quantity,
          unitPrice: input.unitPrice,
          discount: input.discount
        }
      ];
}

export function calculateDirectSaleTotals(input: StockSaleInput) {
  const saleLines = buildDirectSaleLines(input);
  const grossTotal = saleLines.reduce((total, line) => total.plus(new Prisma.Decimal(line.quantity).mul(line.unitPrice)), new Prisma.Decimal(0));
  const discount = saleLines.reduce((total, line) => total.plus(line.discount || 0), new Prisma.Decimal(0));
  const finalTotal = grossTotal.minus(discount);

  return { saleLines, grossTotal, discount, finalTotal };
}

export function directSaleReceiptPayload(sale: DirectSaleReceiptSource) {
  const items = parseSaleLines(sale.consumedLots);
  const fallbackItems = [
    {
      itemId: sale.item.id,
      itemCode: sale.item.code,
      description: sale.item.description,
      unitCode: sale.item.unit.code,
      warehouse: `${sale.warehouse.code} - ${sale.warehouse.name}`,
      quantity: sale.quantity.toString(),
      unitPrice: sale.unitPrice.toString(),
      grossTotal: sale.grossTotal.toString(),
      discount: sale.discount.toString(),
      finalTotal: sale.finalTotal.toString()
    }
  ];

  return {
    id: sale.id,
    receiptNumber: sale.number,
    issuedAtLabel: formatReceiptDate(sale.issuedAt),
    sellerName: sale.createdBy.name,
    customerName: sale.customerName,
    customerDocument: sale.customerDocument || "",
    paymentMethod: sale.paymentMethod || "Nao informado",
    note: sale.note || "",
    warehouse: `${sale.warehouse.code} - ${sale.warehouse.name}`,
    item: {
      id: sale.item.id,
      code: sale.item.code,
      description: sale.item.description,
      unitCode: sale.item.unit.code
    },
    items: items.length > 0 ? items : fallbackItems,
    quantity: sale.quantity.toString(),
    unitPrice: sale.unitPrice.toString(),
    grossTotal: sale.grossTotal.toString(),
    discount: sale.discount.toString(),
    finalTotal: sale.finalTotal.toString(),
    financialTitle: sale.accountReceivable
      ? {
          number: sale.accountReceivable.number,
          status: sale.accountReceivable.status,
          dueDateLabel: formatReceiptDate(sale.accountReceivable.dueDate),
          receivedAmount: sale.accountReceivable.receivedAmount.toString()
        }
      : null
  };
}

function parseConsumedLotsList(value: unknown): ConsumedLot[] {
  if (!Array.isArray(value)) return [];

  return value
    .map((item) => {
      if (!item || typeof item !== "object") return null;

      const record = item as Record<string, unknown>;
      return {
        lotId: typeof record.lotId === "string" ? record.lotId : null,
        lotCode: typeof record.lotCode === "string" ? record.lotCode : "SEM_LOTE",
        quantity: String(record.quantity || "0")
      };
    })
    .filter((item): item is ConsumedLot => Boolean(item));
}

function parseRestockLines(value: unknown, fallback: RestockLine): RestockLine[] {
  if (!value || typeof value !== "object" || Array.isArray(value)) {
    return [fallback];
  }

  const saleItems = (value as Record<string, unknown>).saleItems;
  if (!Array.isArray(saleItems)) {
    return [fallback];
  }

  const parsed = saleItems
    .map((item) => {
      if (!item || typeof item !== "object") return null;
      const record = item as Record<string, unknown>;
      const itemId = String(record.itemId || "");
      const warehouseId = String(record.warehouseId || "");

      if (!itemId || !warehouseId) return null;

      return {
        itemId,
        warehouseId,
        quantity: String(record.quantity || "0"),
        unitPrice: String(record.unitPrice || "0"),
        finalTotal: String(record.finalTotal || "0"),
        consumedLots: parseConsumedLotsList(record.consumedLots)
      };
    })
    .filter((item): item is RestockLine => Boolean(item));

  return parsed.length > 0 ? parsed : [fallback];
}

export async function createDirectSale(prisma: PrismaClient, input: StockSaleInput, session: DirectSaleSession) {
  const { saleLines, grossTotal, discount, finalTotal } = calculateDirectSaleTotals(input);

  if (finalTotal.lessThan(0)) {
    throw new Error("O desconto nao pode ser maior que o total bruto.");
  }

  return serializableTransaction(prisma, async (tx) => {
    const [items, warehouses, customer] = await Promise.all([
      tx.item.findMany({
        where: { id: { in: saleLines.map((line) => line.itemId) } },
        include: { unit: true },
        take: saleLines.length
      }),
      tx.warehouse.findMany({
        where: { id: { in: saleLines.map((line) => line.warehouseId) } },
        take: saleLines.length
      }),
      input.customerId ? tx.customer.findUnique({ where: { id: input.customerId } }) : null
    ]);

    if (input.customerId && (!customer || !customer.active)) {
      throw new Error("Cliente selecionado invalido ou inativo.");
    }

    if (!customer) {
      throw new Error("Selecione um cliente cadastrado para gerar a venda e o financeiro.");
    }

    const receiptNumber = makeAutomaticCode("REC");
    const snapshots: SaleLineSnapshot[] = [];

    for (const line of saleLines) {
      const item = items.find((record) => record.id === line.itemId);
      const warehouse = warehouses.find((record) => record.id === line.warehouseId);

      if (!item || !item.active || !item.controlsStock) {
        throw new Error("Item invalido para venda pelo estoque.");
      }

      if (!warehouse || !warehouse.active) {
        throw new Error("Deposito invalido para venda.");
      }

      const quantity = new Prisma.Decimal(line.quantity);
      const unitPrice = new Prisma.Decimal(line.unitPrice);
      const lineDiscount = new Prisma.Decimal(line.discount || 0);
      const lineGrossTotal = quantity.mul(unitPrice);
      const lineFinalTotal = lineGrossTotal.minus(lineDiscount);

      if (lineFinalTotal.lessThan(0)) {
        throw new Error(`O desconto do item ${item.code} nao pode ser maior que o total bruto.`);
      }

      const consumedLots = await consumeStockFromWarehouse(tx, {
        itemId: line.itemId,
        warehouse,
        quantity
      }).catch((error) => {
        if (error instanceof Error && error.message.startsWith("Saldo insuficiente.")) {
          throw new Error(`Saldo insuficiente para vender ${item.code}. ${error.message.replace("Saldo insuficiente. ", "")} ${item.unit.code}.`);
        }

        throw error;
      });

      const movement = await tx.stockMovement.create({
        data: {
          type: "AJUSTE_NEGATIVO",
          itemId: line.itemId,
          quantity,
          unitCost: unitPrice,
          totalCost: lineFinalTotal,
          originWarehouseId: line.warehouseId,
          userId: session.userId,
          document: receiptNumber,
          justification: `Venda direta do estoque para ${input.customerName}`
        }
      });

      await tx.auditLog.create({
        data: {
          userId: session.userId,
          module: "Estoque",
          action: AuditAction.STOCK_MOVE,
          entity: "StockMovement",
          entityId: movement.id,
          newValue: {
            operation: "VENDA_ESTOQUE",
            receiptNumber,
            customerName: input.customerName,
            itemId: line.itemId,
            quantity: quantity.toString(),
            unitPrice: unitPrice.toString(),
            discount: lineDiscount.toString(),
            finalTotal: lineFinalTotal.toString(),
            consumedLots
          },
          justification: input.note || "Venda direta do estoque"
        }
      });

      snapshots.push({
        itemId: item.id,
        itemCode: item.code,
        description: item.description,
        unitCode: item.unit.code,
        warehouseId: warehouse.id,
        warehouse: `${warehouse.code} - ${warehouse.name}`,
        quantity: quantity.toString(),
        unitPrice: unitPrice.toString(),
        grossTotal: lineGrossTotal.toString(),
        discount: lineDiscount.toString(),
        finalTotal: lineFinalTotal.toString(),
        movementId: movement.id,
        consumedLots
      });
    }

    const firstLine = saleLines[0];
    const firstSnapshot = snapshots[0];
    const sale = await tx.directSale.create({
      data: {
        number: receiptNumber,
        customerId: customer.id,
        customerName: input.customerName,
        customerDocument: input.customerDocument || null,
        itemId: firstLine.itemId,
        warehouseId: firstLine.warehouseId,
        stockMovementId: firstSnapshot.movementId,
        createdById: session.userId,
        quantity: new Prisma.Decimal(firstLine.quantity),
        unitPrice: new Prisma.Decimal(firstLine.unitPrice),
        grossTotal,
        discount,
        finalTotal,
        paymentMethod: input.paymentMethod || null,
        note: input.note || null,
        consumedLots: { version: 2, saleItems: snapshots }
      },
      include: {
        createdBy: true,
        warehouse: true,
        item: { include: { unit: true } }
      }
    });

    const dueDate = new Date();
    const receivable = await tx.accountReceivable.create({
      data: {
        number: makeAutomaticCode("CR"),
        directSaleId: sale.id,
        customerId: customer.id,
        createdById: session.userId,
        status: input.settleNow ? "RECEBIDO" : "ABERTO",
        description: `Venda direta ${sale.number} - ${snapshots.length} item(ns)`,
        documentNumber: sale.number,
        costCenter: "Venda direta",
        issueDate: sale.issuedAt,
        dueDate,
        amount: finalTotal,
        receivedAmount: input.settleNow ? finalTotal : new Prisma.Decimal(0),
        receivedAt: input.settleNow ? sale.issuedAt : null,
        note: input.note || null
      }
    });

    if (input.settleNow) {
      await tx.accountReceipt.create({
        data: {
          accountReceivableId: receivable.id,
          receivedById: session.userId,
          receiptDate: sale.issuedAt,
          amount: finalTotal,
          method: input.paymentMethod || "NAO_INFORMADO",
          reference: sale.number,
          note: "Baixa automatica gerada pela venda direta."
        }
      });
    }

    await tx.auditLog.create({
      data: {
        userId: session.userId,
        module: "Financeiro",
        action: AuditAction.CREATE,
        entity: "AccountReceivable",
        entityId: receivable.id,
        newValue: {
          number: receivable.number,
          directSaleNumber: sale.number,
          customer: customer.name,
          amount: receivable.amount.toString(),
          status: receivable.status,
          settledNow: input.settleNow,
          items: snapshots.length
        },
        justification: "Titulo financeiro gerado pela venda direta"
      }
    });

    return { ...sale, accountReceivable: receivable };
  });
}

export async function cancelDirectSale(prisma: PrismaClient, saleId: string, session: DirectSaleSession, reason?: string) {
  return serializableTransaction(prisma, async (tx) => {
    const sale = await tx.directSale.findUnique({
      where: { id: saleId },
      include: {
        item: { include: { unit: true } },
        warehouse: true,
        accountsReceivable: {
          include: {
            receipts: true
          }
        }
      }
    });

    if (!sale) {
      throw new Error("Recibo nao encontrado.");
    }

    if (sale.status !== "ATIVA") {
      throw new Error("Este recibo ja esta cancelado.");
    }

    const receivable = sale.accountsReceivable[0];
    const cancelReason = reason || null;
    const restockLines = parseRestockLines(sale.consumedLots, {
      itemId: sale.itemId,
      warehouseId: sale.warehouseId,
      quantity: sale.quantity.toString(),
      unitPrice: sale.unitPrice.toString(),
      finalTotal: sale.finalTotal.toString(),
      consumedLots: []
    });
    const reversalIds: string[] = [];

    for (const restockLine of restockLines) {
      if (restockLine.consumedLots.length === 0) {
        await increaseStockBalance(
          tx,
          restockLine.itemId,
          restockLine.warehouseId,
          toDecimal(restockLine.quantity),
          null
        );
      } else {
        for (const consumedLot of restockLine.consumedLots) {
          await increaseStockBalance(
            tx,
            restockLine.itemId,
            restockLine.warehouseId,
            toDecimal(consumedLot.quantity),
            consumedLot.lotId
          );
        }
      }

      const reversal = await tx.stockMovement.create({
        data: {
          type: "ESTORNO",
          itemId: restockLine.itemId,
          quantity: toDecimal(restockLine.quantity),
          unitCost: toDecimal(restockLine.unitPrice),
          totalCost: toDecimal(restockLine.finalTotal),
          targetWarehouseId: restockLine.warehouseId,
          userId: session.userId,
          document: `${sale.number}-EST`,
          justification: cancelReason || `Cancelamento do recibo ${sale.number}`
        }
      });
      reversalIds.push(reversal.id);
    }

    const updated = await tx.directSale.update({
      where: { id: saleId },
      data: {
        status: "CANCELADA",
        cancelledById: session.userId,
        cancelledAt: new Date(),
        cancelReason
      }
    });

    if (receivable) {
      await tx.accountReceivable.update({
        where: { id: receivable.id },
        data: {
          status: "CANCELADO",
          receivedAmount: toDecimal(0),
          receivedAt: null,
          note: cancelReason || `Cancelado junto com o recibo ${sale.number}`
        }
      });
    }

    await tx.auditLog.create({
      data: {
        userId: session.userId,
        module: "Estoque",
        action: AuditAction.CANCEL,
        entity: "DirectSale",
        entityId: saleId,
        previousValue: {
          status: sale.status,
          number: sale.number,
          accountReceivable: receivable
            ? {
                id: receivable.id,
                number: receivable.number,
                status: receivable.status,
                receivedAmount: receivable.receivedAmount.toString(),
                receiptCount: receivable.receipts.length
              }
            : null
        },
        newValue: {
          status: updated.status,
          accountReceivable: receivable
            ? {
                id: receivable.id,
                number: receivable.number,
                status: "CANCELADO",
                receivedAmount: "0"
              }
            : null,
          reversalMovementIds: reversalIds
        },
        justification: cancelReason || "Cancelamento de recibo com estorno de estoque"
      }
    });

    return updated;
  });
}
