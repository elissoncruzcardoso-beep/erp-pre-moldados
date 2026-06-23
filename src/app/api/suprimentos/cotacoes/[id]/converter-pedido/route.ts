import { AuditAction, Prisma } from "@prisma/client";
import { apiConflict, apiError, apiSuccess, handleApiError } from "@/lib/api/responses";
import { requireApiSession } from "@/lib/auth/guards";
import { makeSupplySequentialCode } from "@/lib/codes/supply-sequence";
import { getPrisma } from "@/lib/db/prisma";
import { serializableTransaction } from "@/lib/db/transactions";

type RouteContext = {
  params: Promise<{ id: string }>;
};

function addDays(date: Date, days: number) {
  const next = new Date(date);
  next.setDate(next.getDate() + days);
  return next;
}

export async function POST(request: Request, context: RouteContext) {
  const auth = await requireApiSession({
    permission: "suprimentos.manage",
    forbiddenMessage: "Voce nao tem permissao para converter pedidos."
  });
  if (auth.response) return auth.response;
  const { session } = auth;

  const { id } = await context.params;
  const prisma = getPrisma();

  try {
    const order = await serializableTransaction(prisma, async (tx) => {
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
          number: await makeSupplySequentialCode(tx, "PC"),
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

    return apiSuccess({ order }, { status: 201 });
  } catch (error) {
    if (error instanceof Error && error.message === "QUOTE_NOT_FOUND") {
      return apiError("Cotacao nao encontrada.", { status: 404 });
    }

    if (error instanceof Error && error.message === "QUOTE_NOT_APPROVED") {
      return apiConflict("Apenas cotacao aprovada pode virar pedido de compra.");
    }

    if (error instanceof Error && error.message === "ORDER_ALREADY_EXISTS") {
      return apiConflict("Esta cotacao ja possui pedido de compra.");
    }

    if (error instanceof Error && error.message === "REQUEST_WITHOUT_ITEMS") {
      return apiConflict("Solicitacao sem itens nao pode virar pedido.");
    }

    if (error instanceof Prisma.PrismaClientKnownRequestError && error.code === "P2002") {
      return apiConflict("Ja existe um pedido com este numero. Tente novamente.");
    }

    return handleApiError(error, "Nao foi possivel converter a cotacao em pedido.", {
      context: {
        request,
        module: "Suprimentos",
        action: "converter_cotacao_pedido",
        userId: session.userId,
        entity: "PurchaseOrder"
      },
      event: "purchase_quote_convert_error"
    });
  }
}
