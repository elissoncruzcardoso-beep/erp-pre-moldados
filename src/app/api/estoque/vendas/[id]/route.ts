import { NextResponse } from "next/server";
import { AuditAction, Prisma } from "@prisma/client";
import { z } from "zod";
import { getSession } from "@/lib/auth/session";
import { getPrisma } from "@/lib/db/prisma";

const updateSaleSchema = z.object({
  customerName: z.string().trim().min(2).max(120),
  customerDocument: z.string().trim().max(40).optional(),
  unitPrice: z.coerce.number().min(0),
  discount: z.coerce.number().min(0).default(0),
  paymentMethod: z.string().trim().max(60).optional(),
  note: z.string().trim().max(240).optional()
});

const cancelSaleSchema = z.object({
  reason: z.string().trim().min(3).max(240).optional()
});

type ConsumedLot = {
  lotId: string | null;
  lotCode: string;
  quantity: string;
};

function parseConsumedLots(value: unknown): ConsumedLot[] {
  if (!Array.isArray(value)) {
    return [];
  }

  return value
    .map((item) => {
      if (!item || typeof item !== "object") {
        return null;
      }

      const record = item as Record<string, unknown>;
      return {
        lotId: typeof record.lotId === "string" ? record.lotId : null,
        lotCode: typeof record.lotCode === "string" ? record.lotCode : "SEM_LOTE",
        quantity: String(record.quantity || "0")
      };
    })
    .filter((item): item is ConsumedLot => Boolean(item));
}

async function addBalance(
  tx: ReturnType<typeof getPrisma>,
  itemId: string,
  warehouseId: string,
  lotId: string | null,
  quantity: Prisma.Decimal
) {
  const current = await tx.stockBalance.findFirst({
    where: { itemId, warehouseId, lotId }
  });

  if (current) {
    return tx.stockBalance.update({
      where: { id: current.id },
      data: { quantity: current.quantity.plus(quantity) }
    });
  }

  return tx.stockBalance.create({
    data: { itemId, warehouseId, lotId, quantity }
  });
}

export async function PUT(request: Request, context: { params: Promise<{ id: string }> }) {
  const session = await getSession();

  if (!session) {
    return NextResponse.json({ error: "Sessao expirada. Entre novamente." }, { status: 401 });
  }

  if (!session.permissions.includes("estoque.move")) {
    return NextResponse.json({ error: "Voce nao tem permissao para editar recibos." }, { status: 403 });
  }

  const { id } = await context.params;
  const body = await request.json().catch(() => null);
  const parsed = updateSaleSchema.safeParse(body);

  if (!parsed.success) {
    return NextResponse.json({ error: "Revise os dados do recibo." }, { status: 400 });
  }

  const input = parsed.data;
  const prisma = getPrisma();
  const unitPrice = new Prisma.Decimal(input.unitPrice);
  const discount = new Prisma.Decimal(input.discount);

  try {
    const result = await prisma.$transaction(async (tx) => {
      const sale = await tx.directSale.findUnique({ where: { id } });

      if (!sale) {
        throw new Error("Recibo nao encontrado.");
      }

      if (sale.status !== "ATIVA") {
        throw new Error("Recibos cancelados nao podem ser editados.");
      }

      const grossTotal = sale.quantity.mul(unitPrice);
      const finalTotal = grossTotal.minus(discount);

      if (finalTotal.lessThan(0)) {
        throw new Error("O desconto nao pode ser maior que o total bruto.");
      }

      const updated = await tx.directSale.update({
        where: { id },
        data: {
          customerName: input.customerName,
          customerDocument: input.customerDocument || null,
          unitPrice,
          grossTotal,
          discount,
          finalTotal,
          paymentMethod: input.paymentMethod || null,
          note: input.note || null
        }
      });

      if (sale.stockMovementId) {
        await tx.stockMovement.update({
          where: { id: sale.stockMovementId },
          data: {
            unitCost: unitPrice,
            totalCost: finalTotal,
            justification: `Venda direta do estoque para ${input.customerName}`
          }
        });
      }

      await tx.auditLog.create({
        data: {
          userId: session.userId,
          module: "Estoque",
          action: AuditAction.UPDATE,
          entity: "DirectSale",
          entityId: id,
          newValue: {
            number: updated.number,
            customerName: updated.customerName,
            unitPrice: updated.unitPrice.toString(),
            discount: updated.discount.toString(),
            finalTotal: updated.finalTotal.toString()
          },
          justification: "Edicao de dados comerciais do recibo"
        }
      });

      return updated;
    });

    return NextResponse.json({ sale: result });
  } catch (error) {
    const message = error instanceof Error ? error.message : "Nao foi possivel editar o recibo.";

    return NextResponse.json({ error: message }, { status: 400 });
  }
}

export async function DELETE(request: Request, context: { params: Promise<{ id: string }> }) {
  const session = await getSession();

  if (!session) {
    return NextResponse.json({ error: "Sessao expirada. Entre novamente." }, { status: 401 });
  }

  if (!session.permissions.includes("estoque.move")) {
    return NextResponse.json({ error: "Voce nao tem permissao para cancelar recibos." }, { status: 403 });
  }

  const { id } = await context.params;
  const body = await request.json().catch(() => ({}));
  const parsed = cancelSaleSchema.safeParse(body);

  if (!parsed.success) {
    return NextResponse.json({ error: "Revise o motivo do cancelamento." }, { status: 400 });
  }

  const prisma = getPrisma();

  try {
    const result = await prisma.$transaction(async (tx) => {
      const sale = await tx.directSale.findUnique({
        where: { id },
        include: {
          item: { include: { unit: true } },
          warehouse: true
        }
      });

      if (!sale) {
        throw new Error("Recibo nao encontrado.");
      }

      if (sale.status !== "ATIVA") {
        throw new Error("Este recibo ja esta cancelado.");
      }

      const consumedLots = parseConsumedLots(sale.consumedLots);

      if (consumedLots.length === 0) {
        await addBalance(tx as ReturnType<typeof getPrisma>, sale.itemId, sale.warehouseId, null, sale.quantity);
      } else {
        for (const consumedLot of consumedLots) {
          await addBalance(
            tx as ReturnType<typeof getPrisma>,
            sale.itemId,
            sale.warehouseId,
            consumedLot.lotId,
            new Prisma.Decimal(consumedLot.quantity)
          );
        }
      }

      const reversal = await tx.stockMovement.create({
        data: {
          type: "ESTORNO",
          itemId: sale.itemId,
          quantity: sale.quantity,
          unitCost: sale.unitPrice,
          totalCost: sale.finalTotal,
          targetWarehouseId: sale.warehouseId,
          userId: session.userId,
          document: `${sale.number}-EST`,
          justification: parsed.data.reason || `Cancelamento do recibo ${sale.number}`
        }
      });

      const updated = await tx.directSale.update({
        where: { id },
        data: {
          status: "CANCELADA",
          cancelledById: session.userId,
          cancelledAt: new Date(),
          cancelReason: parsed.data.reason || null
        }
      });

      await tx.auditLog.create({
        data: {
          userId: session.userId,
          module: "Estoque",
          action: AuditAction.CANCEL,
          entity: "DirectSale",
          entityId: id,
          previousValue: {
            status: sale.status,
            number: sale.number
          },
          newValue: {
            status: updated.status,
            reversalMovementId: reversal.id
          },
          justification: parsed.data.reason || "Cancelamento de recibo com estorno de estoque"
        }
      });

      return updated;
    });

    return NextResponse.json({ sale: result });
  } catch (error) {
    const message = error instanceof Error ? error.message : "Nao foi possivel cancelar o recibo.";

    return NextResponse.json({ error: message }, { status: 400 });
  }
}
