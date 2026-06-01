import { AuditAction, Prisma } from "@prisma/client";
import { apiError, apiForbidden, apiSuccess, apiUnauthorized, apiValidationError, handleApiError } from "@/lib/api/responses";
import { getSession } from "@/lib/auth/session";
import { makeAutomaticCode } from "@/lib/codes/auto-code";
import { getPrisma } from "@/lib/db/prisma";
import { parseSaleLines } from "@/lib/sales/parse-sale-lines";
import { consumeStockFromWarehouse } from "@/lib/stock/transactions";
import { stockSaleSchema, type SaleItemInput } from "@/lib/validations/sales";

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

function formatDate(value: Date) {
  return value.toLocaleString("pt-BR", {
    dateStyle: "short",
    timeStyle: "short"
  });
}

function receiptPayload(sale: {
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
}) {
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
    issuedAtLabel: formatDate(sale.issuedAt),
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
          dueDateLabel: formatDate(sale.accountReceivable.dueDate),
          receivedAmount: sale.accountReceivable.receivedAmount.toString()
        }
      : null
  };
}

export async function POST(request: Request) {
  const session = await getSession();

  if (!session) {
    return apiUnauthorized();
  }

  if (!session.permissions.includes("estoque.move")) {
    return apiForbidden("Voce nao tem permissao para vender pelo estoque.");
  }

  const body = await request.json().catch(() => null);
  const parsed = stockSaleSchema.safeParse(body);

  if (!parsed.success) {
    return apiValidationError("Revise os dados da venda.", parsed.error.flatten());
  }

  const input = parsed.data;
  const saleLines: SaleLineInput[] =
    input.items && input.items.length > 0
      ? input.items
      : [{ itemId: input.itemId, warehouseId: input.warehouseId, quantity: input.quantity, unitPrice: input.unitPrice, discount: input.discount }];

  const grossTotal = saleLines.reduce((total, line) => total.plus(new Prisma.Decimal(line.quantity).mul(line.unitPrice)), new Prisma.Decimal(0));
  const discount = saleLines.reduce((total, line) => total.plus(line.discount || 0), new Prisma.Decimal(0));
  const finalTotal = grossTotal.minus(discount);

  if (finalTotal.lessThan(0)) {
    return apiError("O desconto nao pode ser maior que o total bruto.");
  }

  const prisma = getPrisma();

  try {
    const result = await prisma.$transaction(async (tx) => {
      const [items, warehouses, customer] = await Promise.all([
        tx.item.findMany({
          where: { id: { in: saleLines.map((line) => line.itemId) } },
          include: { unit: true }
        }),
        tx.warehouse.findMany({ where: { id: { in: saleLines.map((line) => line.warehouseId) } } }),
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

    return apiSuccess({ receipt: receiptPayload(result) }, { status: 201 });
  } catch (error) {
    return handleApiError(error, "Nao foi possivel registrar a venda.");
  }
}
