import { NextResponse } from "next/server";
import { AuditAction, Prisma } from "@prisma/client";
import { getSession } from "@/lib/auth/session";
import { getPrisma } from "@/lib/db/prisma";

type RouteContext = {
  params: Promise<{ id: string }>;
};

function makeOrderNumber() {
  const date = new Date();
  const stamp = `${date.getFullYear()}${String(date.getMonth() + 1).padStart(2, "0")}${String(date.getDate()).padStart(2, "0")}`;
  const suffix = String(Math.floor(Math.random() * 9000) + 1000);

  return `PC-${stamp}-${suffix}`;
}

function addDays(date: Date, days: number) {
  const next = new Date(date);
  next.setDate(next.getDate() + days);
  return next;
}

export async function POST(_request: Request, context: RouteContext) {
  const session = await getSession();

  if (!session) {
    return NextResponse.json({ error: "Sessao expirada. Entre novamente." }, { status: 401 });
  }

  if (!session.permissions.includes("suprimentos.manage")) {
    return NextResponse.json({ error: "Voce nao tem permissao para converter pedidos." }, { status: 403 });
  }

  const { id } = await context.params;
  const prisma = getPrisma();

  try {
    const order = await prisma.$transaction(async (tx) => {
      const quote = await tx.purchaseQuote.findUnique({
        where: { id },
        include: {
          purchaseOrder: true,
          supplier: true,
          items: {
            include: {
              supplier: true
            }
          },
          purchaseRequest: {
            include: {
              items: true
            }
          }
        }
      });

      if (!quote) {
        throw new Error("QUOTE_NOT_FOUND");
      }

      if (quote.status !== "APROVADA") {
        throw new Error("QUOTE_NOT_APPROVED");
      }

      if (quote.purchaseOrder) {
        throw new Error("ORDER_ALREADY_EXISTS");
      }

      if (quote.purchaseRequest.items.length === 0 && quote.items.length === 0) {
        throw new Error("REQUEST_WITHOUT_ITEMS");
      }

      const orderItems = quote.items.length > 0
        ? quote.items.map((item) => ({
            itemId: item.itemId,
            quantity: item.quantity,
            unitPrice: item.unitPrice,
            totalValue: item.totalValue,
            note: item.note
          }))
        : (() => {
            const totalQuantity = quote.purchaseRequest.items.reduce(
              (sum, item) => sum.plus(item.quantity),
              new Prisma.Decimal(0)
            );
            const unitPrice = totalQuantity.gt(0) ? quote.totalValue.div(totalQuantity) : new Prisma.Decimal(0);

            return quote.purchaseRequest.items.map((item) => ({
              itemId: item.itemId,
              quantity: item.quantity,
              unitPrice,
              totalValue: unitPrice.mul(item.quantity),
              note: item.note
            }));
          })();
      const expectedDeliveryAt = quote.deliveryDays === null ? null : addDays(new Date(), quote.deliveryDays);

      const created = await tx.purchaseOrder.create({
        data: {
          number: makeOrderNumber(),
          purchaseQuoteId: quote.id,
          purchaseRequestId: quote.purchaseRequestId,
          supplierId: quote.supplierId,
          createdById: session.userId,
          expectedDeliveryAt,
          paymentTerms: quote.paymentTerms,
          freightCost: quote.freightCost,
          totalValue: quote.totalValue,
          note: quote.note,
          items: {
            create: orderItems
          }
        },
        include: {
          supplier: true,
          purchaseQuote: true,
          purchaseRequest: true,
          items: true
        }
      });

      await tx.purchaseRequest.update({
        where: { id: quote.purchaseRequestId },
        data: { status: "CONVERTIDA_PEDIDO" }
      });

      await tx.auditLog.create({
        data: {
          userId: session.userId,
          module: "Suprimentos",
          action: AuditAction.CREATE,
          entity: "PurchaseOrder",
          entityId: created.id,
          newValue: {
            number: created.number,
            quote: created.purchaseQuote.number,
            purchaseRequest: created.purchaseRequest.number,
            supplier: created.supplier.name,
            totalValue: created.totalValue.toString(),
            itemCount: created.items.length
          }
        }
      });

      return created;
    });

    return NextResponse.json({ order }, { status: 201 });
  } catch (error) {
    if (error instanceof Error && error.message === "QUOTE_NOT_FOUND") {
      return NextResponse.json({ error: "Cotacao nao encontrada." }, { status: 404 });
    }

    if (error instanceof Error && error.message === "QUOTE_NOT_APPROVED") {
      return NextResponse.json({ error: "Apenas cotacao aprovada pode virar pedido de compra." }, { status: 409 });
    }

    if (error instanceof Error && error.message === "ORDER_ALREADY_EXISTS") {
      return NextResponse.json({ error: "Esta cotacao ja possui pedido de compra." }, { status: 409 });
    }

    if (error instanceof Error && error.message === "REQUEST_WITHOUT_ITEMS") {
      return NextResponse.json({ error: "Solicitacao sem itens nao pode virar pedido." }, { status: 409 });
    }

    if (error instanceof Prisma.PrismaClientKnownRequestError && error.code === "P2002") {
      return NextResponse.json({ error: "Ja existe um pedido com este numero. Tente novamente." }, { status: 409 });
    }

    return NextResponse.json({ error: "Nao foi possivel converter a cotacao em pedido." }, { status: 500 });
  }
}
