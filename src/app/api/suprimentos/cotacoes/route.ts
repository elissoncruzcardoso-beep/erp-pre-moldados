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
import { makeAutomaticCode } from "@/lib/codes/auto-code";
import { getPrisma } from "@/lib/db/prisma";
import { purchaseQuoteSchema } from "@/lib/validations/purchase";

export async function POST(request: Request) {
  const session = await getSession();

  if (!session) {
    return apiUnauthorized();
  }

  if (!session.permissions.includes("suprimentos.manage")) {
    return apiForbidden("Voce nao tem permissao para criar cotacoes.");
  }

  const body = await request.json().catch(() => null);
  const parsed = purchaseQuoteSchema.safeParse(body);

  if (!parsed.success) {
    return apiValidationError("Revise os campos da cotacao de precos.", parsed.error.flatten());
  }

  const input = parsed.data;
  const prisma = getPrisma();

  try {
    const quote = await prisma.$transaction(async (tx) => {
      const requestRecord = await tx.purchaseRequest.findUnique({
        where: { id: input.purchaseRequestId },
        include: { items: true }
      });

      if (!requestRecord) {
        throw new Error("PURCHASE_REQUEST_NOT_FOUND");
      }

      const requestItemsById = new Map(requestRecord.items.map((item) => [item.id, item]));
      const quoteItems = input.items.map((item) => {
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
      const lineFreight = quoteItems.reduce((sum, item) => sum.plus(item.freightCost), new Prisma.Decimal(0));
      const headerFreight = new Prisma.Decimal(input.freightCost);
      const totalValue = quoteItems.reduce((sum, item) => sum.plus(item.totalValue), new Prisma.Decimal(0)).plus(headerFreight);

      const created = await tx.purchaseQuote.create({
        data: {
          number: makeAutomaticCode("COT"),
          purchaseRequestId: input.purchaseRequestId,
          supplierId: input.supplierId,
          createdById: session.userId,
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
          items: true,
          createdBy: true
        }
      });

      if (requestRecord.status === "ABERTA") {
        await tx.purchaseRequest.update({
          where: { id: requestRecord.id },
          data: { status: "EM_COTACAO" }
        });
      }

      await tx.auditLog.create({
        data: {
          userId: session.userId,
          module: "Suprimentos",
          action: AuditAction.CREATE,
          entity: "PurchaseQuote",
          entityId: created.id,
          newValue: {
            number: created.number,
            purchaseRequest: created.purchaseRequest.number,
            supplier: created.supplier.name,
            totalValue: created.totalValue.toString(),
            itemCount: created.items.length,
            status: created.status
          }
        }
      });

      return created;
    });

    return apiSuccess({ quote }, { status: 201 });
  } catch (error) {
    if (error instanceof Error && error.message === "PURCHASE_REQUEST_NOT_FOUND") {
      return apiError("Solicitacao de compra nao encontrada.", { status: 404 });
    }

    if (error instanceof Error && error.message === "QUOTE_ITEM_INVALID") {
      return apiValidationError("Revise os itens da cotacao. Ha item invalido ou valor inconsistente.");
    }

    if (error instanceof Prisma.PrismaClientKnownRequestError && error.code === "P2002") {
      return apiConflict("Ja existe uma cotacao com este numero.");
    }

    return handleApiError(error, "Nao foi possivel criar a cotacao.");
  }
}
