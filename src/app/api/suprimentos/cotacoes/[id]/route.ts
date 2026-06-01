import { AuditAction, Prisma } from "@prisma/client";
import {
  apiConflict,
  apiError,
  apiForbidden,
  apiSuccess,
  apiUnauthorized,
  apiValidationError,
  handleApiError
} from "@/lib/api/responses";
import { getSession } from "@/lib/auth/session";
import { getPrisma } from "@/lib/db/prisma";
import { purchaseQuoteSchema } from "@/lib/validations/purchase";

type RouteContext = {
  params: Promise<{ id: string }>;
};

function buildQuoteItems(input: ReturnType<typeof purchaseQuoteSchema.parse>, requestItems: { id: string; itemId: string }[]) {
  const requestItemsById = new Map(requestItems.map((item) => [item.id, item]));

  return input.items.map((item) => {
    const requestItem = requestItemsById.get(item.purchaseRequestItemId);

    if (!requestItem || requestItem.itemId !== item.itemId) {
      throw new Error("QUOTE_ITEM_INVALID");
    }

    const quantity = new Prisma.Decimal(item.quantity);
    const unitPrice = new Prisma.Decimal(item.unitPrice);
    const discountValue = new Prisma.Decimal(item.discountValue);
    const freightCost = new Prisma.Decimal(item.freightCost);
    const totalValue = quantity.mul(unitPrice).minus(discountValue).plus(freightCost);

    if (totalValue.lt(0)) {
      throw new Error("QUOTE_ITEM_INVALID");
    }

    return {
      purchaseRequestItemId: item.purchaseRequestItemId,
      itemId: item.itemId,
      supplierId: item.supplierId,
      quantity,
      unitPrice,
      discountValue,
      freightCost,
      totalValue,
      note: item.note?.trim() || null
    };
  });
}

export async function PATCH(request: Request, context: RouteContext) {
  const session = await getSession();

  if (!session) {
    return apiUnauthorized();
  }

  if (!session.permissions.includes("suprimentos.manage")) {
    return apiForbidden("Voce nao tem permissao para editar cotacoes.");
  }

  const body = await request.json().catch(() => null);
  const parsed = purchaseQuoteSchema.safeParse(body);

  if (!parsed.success) {
    return apiValidationError("Revise os campos da cotacao.", parsed.error.flatten());
  }

  const { id } = await context.params;
  const input = parsed.data;
  const prisma = getPrisma();

  try {
    const quote = await prisma.$transaction(async (tx) => {
      const current = await tx.purchaseQuote.findUnique({
        where: { id },
        include: {
          purchaseOrder: true,
          purchaseRequest: {
            include: {
              items: true
            }
          },
          items: true,
          supplier: true
        }
      });

      if (!current) {
        throw new Error("QUOTE_NOT_FOUND");
      }

      if (current.purchaseOrder) {
        throw new Error("QUOTE_HAS_ORDER");
      }

      if (current.purchaseRequestId !== input.purchaseRequestId) {
        throw new Error("PURCHASE_REQUEST_MISMATCH");
      }

      const quoteItems = buildQuoteItems(input, current.purchaseRequest.items);
      const lineFreight = quoteItems.reduce((sum, item) => sum.plus(item.freightCost), new Prisma.Decimal(0));
      const headerFreight = new Prisma.Decimal(input.freightCost);
      const totalValue = quoteItems.reduce((sum, item) => sum.plus(item.totalValue), new Prisma.Decimal(0)).plus(headerFreight);

      await tx.purchaseQuoteItem.deleteMany({
        where: { purchaseQuoteId: current.id }
      });

      const updated = await tx.purchaseQuote.update({
        where: { id: current.id },
        data: {
          supplierId: input.supplierId,
          status: current.status === "APROVADA" ? "RECEBIDA" : current.status,
          deliveryDays: input.deliveryDays ?? null,
          paymentTerms: input.paymentTerms?.trim() || null,
          validUntil: input.validUntil || null,
          freightCost: headerFreight.plus(lineFreight),
          totalValue,
          note: input.note?.trim() || null,
          items: {
            create: quoteItems
          }
        },
        include: {
          supplier: true,
          purchaseRequest: true,
          items: true
        }
      });

      await tx.auditLog.create({
        data: {
          userId: session.userId,
          module: "Suprimentos",
          action: AuditAction.UPDATE,
          entity: "PurchaseQuote",
          entityId: updated.id,
          previousValue: {
            number: current.number,
            supplier: current.supplier.name,
            totalValue: current.totalValue.toString(),
            status: current.status,
            itemCount: current.items.length
          },
          newValue: {
            number: updated.number,
            supplier: updated.supplier.name,
            totalValue: updated.totalValue.toString(),
            status: updated.status,
            itemCount: updated.items.length
          }
        }
      });

      return updated;
    });

    return apiSuccess({ quote });
  } catch (error) {
    if (error instanceof Error && error.message === "QUOTE_NOT_FOUND") {
      return apiError("Cotacao nao encontrada.", { status: 404 });
    }

    if (error instanceof Error && error.message === "QUOTE_HAS_ORDER") {
      return apiConflict("Cotacao com pedido gerado nao pode ser editada.");
    }

    if (error instanceof Error && error.message === "PURCHASE_REQUEST_MISMATCH") {
      return apiConflict("A solicitacao da cotacao nao pode ser alterada.");
    }

    if (error instanceof Error && error.message === "QUOTE_ITEM_INVALID") {
      return apiValidationError("Revise os itens da cotacao. Ha item invalido ou valor inconsistente.");
    }

    if (error instanceof Prisma.PrismaClientKnownRequestError && error.code === "P2002") {
      return apiConflict("Ja existe uma cotacao com este numero.");
    }

    return handleApiError(error, "Nao foi possivel editar a cotacao.");
  }
}

export async function DELETE(_request: Request, context: RouteContext) {
  const session = await getSession();

  if (!session) {
    return apiUnauthorized();
  }

  if (!session.permissions.includes("suprimentos.manage")) {
    return apiForbidden("Voce nao tem permissao para excluir cotacoes.");
  }

  const { id } = await context.params;
  const prisma = getPrisma();

  try {
    await prisma.$transaction(async (tx) => {
      const current = await tx.purchaseQuote.findUnique({
        where: { id },
        include: {
          purchaseOrder: true,
          purchaseRequest: true,
          supplier: true
        }
      });

      if (!current) {
        throw new Error("QUOTE_NOT_FOUND");
      }

      if (current.purchaseOrder) {
        throw new Error("QUOTE_HAS_ORDER");
      }

      await tx.purchaseQuote.delete({
        where: { id: current.id }
      });

      const remainingQuotes = await tx.purchaseQuote.count({
        where: { purchaseRequestId: current.purchaseRequestId }
      });

      if (remainingQuotes === 0 && current.purchaseRequest.status === "EM_COTACAO") {
        await tx.purchaseRequest.update({
          where: { id: current.purchaseRequestId },
          data: { status: "ABERTA" }
        });
      }

      await tx.auditLog.create({
        data: {
          userId: session.userId,
          module: "Suprimentos",
          action: AuditAction.DELETE,
          entity: "PurchaseQuote",
          entityId: current.id,
          previousValue: {
            number: current.number,
            supplier: current.supplier.name,
            purchaseRequest: current.purchaseRequest.number,
            totalValue: current.totalValue.toString(),
            status: current.status
          }
        }
      });
    });

    return apiSuccess({});
  } catch (error) {
    if (error instanceof Error && error.message === "QUOTE_NOT_FOUND") {
      return apiError("Cotacao nao encontrada.", { status: 404 });
    }

    if (error instanceof Error && error.message === "QUOTE_HAS_ORDER") {
      return apiConflict("Cotacao com pedido gerado nao pode ser excluida.");
    }

    return handleApiError(error, "Nao foi possivel excluir a cotacao.");
  }
}
