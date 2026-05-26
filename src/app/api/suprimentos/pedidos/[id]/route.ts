import { NextResponse } from "next/server";
import { AuditAction, Prisma } from "@prisma/client";
import { getSession } from "@/lib/auth/session";
import { getPrisma } from "@/lib/db/prisma";
import { purchaseOrderUpdateSchema } from "@/lib/validations/purchase";

type RouteContext = {
  params: Promise<{ id: string }>;
};

export async function PATCH(request: Request, context: RouteContext) {
  const session = await getSession();

  if (!session) {
    return NextResponse.json({ error: "Sessao expirada. Entre novamente." }, { status: 401 });
  }

  if (!session.permissions.includes("suprimentos.manage")) {
    return NextResponse.json({ error: "Voce nao tem permissao para editar pedidos." }, { status: 403 });
  }

  const body = await request.json().catch(() => null);
  const parsed = purchaseOrderUpdateSchema.safeParse(body);

  if (!parsed.success) {
    return NextResponse.json({ error: "Revise os campos do pedido." }, { status: 400 });
  }

  const { id } = await context.params;
  const input = parsed.data;
  const prisma = getPrisma();

  try {
    const order = await prisma.$transaction(async (tx) => {
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

    return NextResponse.json({ order });
  } catch (error) {
    if (error instanceof Error && error.message === "ORDER_NOT_FOUND") {
      return NextResponse.json({ error: "Pedido nao encontrado." }, { status: 404 });
    }

    if (error instanceof Error && error.message === "ORDER_HAS_RECEIPTS") {
      return NextResponse.json({ error: "Pedido com recebimento/nota fiscal nao pode ser editado." }, { status: 409 });
    }

    if (error instanceof Error && error.message === "ORDER_ITEM_INVALID") {
      return NextResponse.json({ error: "Item invalido no pedido." }, { status: 400 });
    }

    if (error instanceof Prisma.PrismaClientKnownRequestError && error.code === "P2002") {
      return NextResponse.json({ error: "Ja existe um pedido com este numero." }, { status: 409 });
    }

    return NextResponse.json({ error: "Nao foi possivel editar o pedido." }, { status: 500 });
  }
}

export async function DELETE(_request: Request, context: RouteContext) {
  const session = await getSession();

  if (!session) {
    return NextResponse.json({ error: "Sessao expirada. Entre novamente." }, { status: 401 });
  }

  if (!session.permissions.includes("suprimentos.manage")) {
    return NextResponse.json({ error: "Voce nao tem permissao para excluir pedidos." }, { status: 403 });
  }

  const { id } = await context.params;
  const prisma = getPrisma();

  try {
    await prisma.$transaction(async (tx) => {
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

    return NextResponse.json({ ok: true });
  } catch (error) {
    if (error instanceof Error && error.message === "ORDER_NOT_FOUND") {
      return NextResponse.json({ error: "Pedido nao encontrado." }, { status: 404 });
    }

    if (error instanceof Error && error.message === "ORDER_HAS_RECEIPTS") {
      return NextResponse.json({ error: "Pedido com recebimento/nota fiscal nao pode ser excluido." }, { status: 409 });
    }

    return NextResponse.json({ error: "Nao foi possivel excluir o pedido." }, { status: 500 });
  }
}
