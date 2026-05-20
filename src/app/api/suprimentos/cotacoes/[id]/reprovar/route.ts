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
    return NextResponse.json({ error: "Voce nao tem permissao para reprovar cotacoes." }, { status: 403 });
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

    return NextResponse.json({ quote });
  } catch (error) {
    if (error instanceof Error && error.message === "QUOTE_NOT_FOUND") {
      return NextResponse.json({ error: "Cotacao nao encontrada." }, { status: 404 });
    }

    if (error instanceof Error && error.message === "QUOTE_HAS_ORDER") {
      return NextResponse.json({ error: "Cotacao com pedido gerado nao pode ser reprovada." }, { status: 409 });
    }

    return NextResponse.json({ error: "Nao foi possivel reprovar a cotacao." }, { status: 500 });
  }
}
