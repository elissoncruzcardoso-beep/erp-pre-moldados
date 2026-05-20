import { NextResponse } from "next/server";
import { AuditAction } from "@prisma/client";
import { getSession } from "@/lib/auth/session";
import { getPrisma } from "@/lib/db/prisma";

type RouteContext = {
  params: Promise<{ id: string }>;
};

export async function PATCH(_request: Request, context: RouteContext) {
  const session = await getSession();

  if (!session) {
    return NextResponse.json({ error: "Sessao expirada. Entre novamente." }, { status: 401 });
  }

  if (!session.permissions.includes("suprimentos.manage")) {
    return NextResponse.json({ error: "Voce nao tem permissao para aprovar cotacoes." }, { status: 403 });
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

    return NextResponse.json({ quote });
  } catch (error) {
    if (error instanceof Error && error.message === "QUOTE_NOT_FOUND") {
      return NextResponse.json({ error: "Cotacao nao encontrada." }, { status: 404 });
    }

    if (error instanceof Error && error.message === "QUOTE_CANCELED") {
      return NextResponse.json({ error: "Cotacao cancelada nao pode ser aprovada." }, { status: 409 });
    }

    return NextResponse.json({ error: "Nao foi possivel aprovar a cotacao." }, { status: 500 });
  }
}
