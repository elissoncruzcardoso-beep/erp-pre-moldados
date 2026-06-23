import { AuditAction } from "@prisma/client";
import { apiConflict, apiError, apiSuccess, handleApiError } from "@/lib/api/responses";
import { requireApiSession } from "@/lib/auth/guards";
import { getPrisma } from "@/lib/db/prisma";
import { serializableTransaction } from "@/lib/db/transactions";

type RouteContext = {
  params: Promise<{ id: string }>;
};

export async function PATCH(request: Request, context: RouteContext) {
  const auth = await requireApiSession({
    permission: "suprimentos.manage",
    forbiddenMessage: "Voce nao tem permissao para aprovar cotacoes."
  });
  if (auth.response) return auth.response;
  const { session } = auth;

  const { id } = await context.params;
  const prisma = getPrisma();

  try {
    const quote = await serializableTransaction(prisma, async (tx) => {
      const current = await tx.purchaseQuote.findUnique({
        where: { id },
        include: {
          purchaseRequest: true,
          supplier: true
        }
      });

      if (!current) {
        throw new Error("QUOTE_NOT_FOUND");
      }

      if (current.status === "CANCELADA") {
        throw new Error("QUOTE_CANCELED");
      }

      const updated = await tx.purchaseQuote.update({
        where: { id },
        data: { status: "APROVADA" },
        include: {
          purchaseRequest: true,
          supplier: true
        }
      });

      await tx.purchaseQuote.updateMany({
        where: {
          purchaseRequestId: current.purchaseRequestId,
          id: { not: id },
          status: "RECEBIDA"
        },
        data: { status: "REPROVADA" }
      });

      await tx.purchaseRequest.update({
        where: { id: current.purchaseRequestId },
        data: { status: "APROVADA" }
      });

      await tx.auditLog.create({
        data: {
          userId: session.userId,
          module: "Suprimentos",
          action: AuditAction.APPROVE,
          entity: "PurchaseQuote",
          entityId: updated.id,
          previousValue: {
            status: current.status
          },
          newValue: {
            status: updated.status,
            number: updated.number,
            supplier: updated.supplier.name,
            purchaseRequest: updated.purchaseRequest.number
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

    if (error instanceof Error && error.message === "QUOTE_CANCELED") {
      return apiConflict("Cotacao cancelada nao pode ser aprovada.");
    }

    return handleApiError(error, "Nao foi possivel aprovar a cotacao.", {
      context: {
        request,
        module: "Suprimentos",
        action: "aprovar_cotacao",
        userId: session.userId,
        entity: "PurchaseQuote"
      },
      event: "purchase_quote_approve_error"
    });
  }
}
