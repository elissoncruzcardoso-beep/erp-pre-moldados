import { NextResponse } from "next/server";
import { AuditAction, Prisma } from "@prisma/client";
import { z } from "zod";
import { getSession } from "@/lib/auth/session";
import { makeAutomaticCode } from "@/lib/codes/auto-code";
import { getPrisma } from "@/lib/db/prisma";

const saleItemSchema = z.object({
  itemId: z.string().min(1),
  warehouseId: z.string().min(1),
  quantity: z.coerce.number().positive(),
  unitPrice: z.coerce.number().min(0),
  discount: z.coerce.number().min(0).default(0)
});

const stockSaleSchema = z.object({
  customerId: z.string().optional(),
  customerName: z.string().trim().min(2).max(120),
  customerDocument: z.string().trim().max(40).optional(),
  itemId: z.string().min(1),
  warehouseId: z.string().min(1),
  quantity: z.coerce.number().positive(),
  unitPrice: z.coerce.number().min(0),
  discount: z.coerce.number().min(0).default(0),
  items: z.array(saleItemSchema).optional(),
  paymentMethod: z.string().trim().max(60).optional(),
  settleNow: z.coerce.boolean().default(false),
  note: z.string().trim().max(240).optional()
});

type SaleLineInput = z.infer<typeof saleItemSchema>;

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

function parseSaleLines(value: unknown) {
  if (!value || typeof value !== "object" || Array.isArray(value)) return [];

  const saleItems = (value as Record<string, unknown>).saleItems;
  if (!Array.isArray(saleItems)) return [];

  return saleItems
    .map((line) => {
      if (!line || typeof line !== "object") return null;
      const record = line as Record<string, unknown>;
      return {
        itemId: String(record.itemId || ""),
        itemCode: String(record.itemCode || ""),
        description: String(record.description || ""),
        unitCode: String(record.unitCode || "UN"),
        warehouse: String(record.warehouse || ""),
        quantity: String(record.quantity || "0"),
        unitPrice: String(record.unitPrice || "0"),
        grossTotal: String(record.grossTotal || "0"),
        discount: String(record.discount || "0"),
        finalTotal: String(record.finalTotal || "0")
      };
    })
    .filter((line): line is NonNullable<typeof line> => Boolean(line));
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
    return NextResponse.json({ error: "Sessao expirada. Entre novamente." }, { status: 401 });
  }

  if (!session.permissions.includes("estoque.move")) {
    return NextResponse.json({ error: "Voce nao tem permissao para vender pelo estoque." }, { status: 403 });
  }

  const body = await request.json().catch(() => null);
  const parsed = stockSaleSchema.safeParse(body);

  if (!parsed.success) {
    return NextResponse.json({ error: "Revise os dados da venda." }, { status: 400 });
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
    return NextResponse.json({ error: "O desconto nao pode ser maior que o total bruto." }, { status: 400 });
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

        const balances = await tx.stockBalance.findMany({
          where: { itemId: line.itemId, warehouseId: line.warehouseId },
          include: { lot: true },
          orderBy: [{ lot: { createdAt: "asc" } }, { updatedAt: "asc" }]
        });
        const availableQuantity = balances.reduce((total, balance) => {
          const available = balance.quantity.minus(balance.reserved);
          return available.greaterThan(0) ? total.plus(available) : total;
        }, new Prisma.Decimal(0));

        if (!warehouse.allowsNegative && availableQuantity.minus(quantity).lessThan(0)) {
          throw new Error(`Saldo insuficiente para vender ${item.code}. Disponivel neste deposito: ${availableQuantity.toString()} ${item.unit.code}.`);
        }

        let remainingQuantity = quantity;
        const consumedLots: SaleLineSnapshot["consumedLots"] = [];

        for (const balance of balances) {
          if (remainingQuantity.lessThanOrEqualTo(0)) break;

          const available = balance.quantity.minus(balance.reserved);
          if (available.lessThanOrEqualTo(0)) continue;

          const consumed = available.greaterThanOrEqualTo(remainingQuantity) ? remainingQuantity : available;

          await tx.stockBalance.update({
            where: { id: balance.id },
            data: { quantity: balance.quantity.minus(consumed) }
          });

          consumedLots.push({
            lotId: balance.lotId,
            lotCode: balance.lot?.code || "SEM_LOTE",
            quantity: consumed.toString()
          });
          remainingQuantity = remainingQuantity.minus(consumed);
        }

        if (remainingQuantity.greaterThan(0) && warehouse.allowsNegative) {
          const balanceWithoutLot = balances.find((balance) => !balance.lotId);

          if (balanceWithoutLot) {
            await tx.stockBalance.update({
              where: { id: balanceWithoutLot.id },
              data: { quantity: balanceWithoutLot.quantity.minus(remainingQuantity) }
            });
          } else {
            await tx.stockBalance.create({
              data: {
                itemId: line.itemId,
                warehouseId: line.warehouseId,
                quantity: new Prisma.Decimal(0).minus(remainingQuantity)
              }
            });
          }

          consumedLots.push({ lotId: null, lotCode: "SALDO_NEGATIVO", quantity: remainingQuantity.toString() });
        }

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

    return NextResponse.json({ receipt: receiptPayload(result) }, { status: 201 });
  } catch (error) {
    const message = error instanceof Error ? error.message : "Nao foi possivel registrar a venda.";
    return NextResponse.json({ error: message }, { status: 400 });
  }
}
