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
    return apiForbidden("Voce nao tem permissao para reprovar cotacoes.");
  }

  const { id } = await context.params;
  const prisma = getPrisma();

  try {
    const quote = await prisma.$transaction(async (tx) => {
      const current = await tx.purchaseQuote.findUnique({
        where: { id },
        include: {
          purchaseOrder: true,
          supplier: true,
          purchaseRequest: true
        }
      });

      if (!current) {
        throw new Error("QUOTE_NOT_FOUND");
      }

      if (current.purchaseOrder) {
        throw new Error("QUOTE_HAS_ORDER");
      }

      const updated = await tx.purchaseQuote.update({
        where: { id },
        data: { status: "REPROVADA" },
        include: {
          supplier: true,
          purchaseRequest: true
        }
      });

      await tx.auditLog.create({
        data: {
          userId: session.userId,
          module: "Suprimentos",
          action: AuditAction.CANCEL,
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

    if (error instanceof Error && error.message === "QUOTE_HAS_ORDER") {
      return apiConflict("Cotacao com pedido gerado nao pode ser reprovada.");
    }

    return handleApiError(error, "Nao foi possivel reprovar a cotacao.");
  }
}
