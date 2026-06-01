import { AuditAction } from "@prisma/client";
import { apiConflict, apiError, apiForbidden, apiSuccess, apiUnauthorized, handleApiError } from "@/lib/api/responses";
import { getSession } from "@/lib/auth/session";
import { getPrisma } from "@/lib/db/prisma";

type RouteContext = {
  params: Promise<{ id: string }>;
};

export async function PATCH(_request: Request, context: RouteContext) {
  const session = await getSession();

  if (!session) {
    return apiUnauthorized();
  }

  if (!session.permissions.includes("suprimentos.manage")) {
    return apiForbidden("Voce nao tem permissao para aprovar cotacoes.");
  }

  const { id } = await context.params;
  const prisma = getPrisma();

  try {
    const quote = await prisma.$transaction(async (tx) => {
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

    return handleApiError(error, "Nao foi possivel aprovar a cotacao.");
  }
}
