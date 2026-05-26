import { NextResponse } from "next/server";
import { AuditAction, Prisma } from "@prisma/client";
import { z } from "zod";
import { getSession } from "@/lib/auth/session";
import { makeAutomaticCode } from "@/lib/codes/auto-code";
import { getPrisma } from "@/lib/db/prisma";

const stockSaleSchema = z.object({
  customerId: z.string().optional(),
  customerName: z.string().trim().min(2).max(120),
  customerDocument: z.string().trim().max(40).optional(),
  itemId: z.string().min(1),
  warehouseId: z.string().min(1),
  quantity: z.coerce.number().positive(),
  unitPrice: z.coerce.number().min(0),
  discount: z.coerce.number().min(0).default(0),
  paymentMethod: z.string().trim().max(60).optional(),
  note: z.string().trim().max(240).optional()
});

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
  createdBy: { name: string };
  warehouse: { code: string; name: string };
  item: { id: string; code: string; description: string; unit: { code: string } };
}) {
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
    quantity: sale.quantity.toString(),
    unitPrice: sale.unitPrice.toString(),
    grossTotal: sale.grossTotal.toString(),
    discount: sale.discount.toString(),
    finalTotal: sale.finalTotal.toString()
  };
}

function formatDate(value: Date) {
  return value.toLocaleString("pt-BR", {
    dateStyle: "short",
    timeStyle: "short"
  });
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
  const prisma = getPrisma();
  const quantity = new Prisma.Decimal(input.quantity);
  const unitPrice = new Prisma.Decimal(input.unitPrice);
  const discount = new Prisma.Decimal(input.discount);
  const grossTotal = quantity.mul(unitPrice);
  const finalTotal = grossTotal.minus(discount);

  if (finalTotal.lessThan(0)) {
    return NextResponse.json({ error: "O desconto nao pode ser maior que o total bruto." }, { status: 400 });
  }

  try {
    const result = await prisma.$transaction(async (tx) => {
      const [item, warehouse, customer] = await Promise.all([
        tx.item.findUnique({
          where: { id: input.itemId },
          include: { unit: true }
        }),
        tx.warehouse.findUnique({ where: { id: input.warehouseId } }),
        input.customerId ? tx.customer.findUnique({ where: { id: input.customerId } }) : null
      ]);

      if (!item || !item.active || !item.controlsStock) {
        throw new Error("Item invalido para venda pelo estoque.");
      }

      if (!warehouse || !warehouse.active) {
        throw new Error("Deposito invalido para venda.");
      }

      if (input.customerId && (!customer || !customer.active)) {
        throw new Error("Cliente selecionado invalido ou inativo.");
      }

      const balances = await tx.stockBalance.findMany({
        where: {
          itemId: input.itemId,
          warehouseId: input.warehouseId
        },
        include: {
          lot: true
        },
        orderBy: [
          { lot: { createdAt: "asc" } },
          { updatedAt: "asc" }
        ]
      });
      const availableQuantity = balances.reduce((total, balance) => {
        const available = balance.quantity.minus(balance.reserved);
        return available.greaterThan(0) ? total.plus(available) : total;
      }, new Prisma.Decimal(0));

      if (!warehouse.allowsNegative && availableQuantity.minus(quantity).lessThan(0)) {
        throw new Error(`Saldo insuficiente para vender este item. Disponivel neste deposito: ${availableQuantity.toString()} ${item.unit.code}.`);
      }

      let remainingQuantity = quantity;
      const consumedLots: Array<{ lotId: string | null; lotCode: string; quantity: string }> = [];

      for (const balance of balances) {
        if (remainingQuantity.lessThanOrEqualTo(0)) {
          break;
        }

        const available = balance.quantity.minus(balance.reserved);

        if (available.lessThanOrEqualTo(0)) {
          continue;
        }

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
              itemId: input.itemId,
              warehouseId: input.warehouseId,
              quantity: new Prisma.Decimal(0).minus(remainingQuantity)
            }
          });
        }

        consumedLots.push({
          lotId: null,
          lotCode: "SALDO_NEGATIVO",
          quantity: remainingQuantity.toString()
        });
      }

      const receiptNumber = makeAutomaticCode("REC");
      const movement = await tx.stockMovement.create({
        data: {
          type: "AJUSTE_NEGATIVO",
          itemId: input.itemId,
          quantity,
          unitCost: unitPrice,
          totalCost: finalTotal,
          originWarehouseId: input.warehouseId,
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
            itemId: input.itemId,
            quantity: quantity.toString(),
            unitPrice: unitPrice.toString(),
            discount: discount.toString(),
            finalTotal: finalTotal.toString(),
            consumedLots
          },
          justification: input.note || "Venda direta do estoque"
        }
      });

      const sale = await tx.directSale.create({
        data: {
          number: receiptNumber,
          customerId: customer?.id || null,
          customerName: input.customerName,
          customerDocument: input.customerDocument || null,
          itemId: input.itemId,
          warehouseId: input.warehouseId,
          stockMovementId: movement.id,
          createdById: session.userId,
          quantity,
          unitPrice,
          grossTotal,
          discount,
          finalTotal,
          paymentMethod: input.paymentMethod || null,
          note: input.note || null,
          consumedLots
        },
        include: {
          createdBy: true,
          warehouse: true,
          item: { include: { unit: true } }
        }
      });

      return sale;
    });

    return NextResponse.json({
      receipt: receiptPayload(result)
    }, { status: 201 });
  } catch (error) {
    const message = error instanceof Error ? error.message : "Nao foi possivel registrar a venda.";

    return NextResponse.json({ error: message }, { status: 400 });
  }
}
