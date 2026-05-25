import { NextResponse } from "next/server";
import { AuditAction, Prisma } from "@prisma/client";
import { getSession } from "@/lib/auth/session";
import { normalizeManualCode } from "@/lib/codes/auto-code";
import { getPrisma } from "@/lib/db/prisma";
import { purchaseRequestSchema } from "@/lib/validations/purchase";

type RouteContext = {
  params: Promise<{ id: string }>;
};

export async function PATCH(request: Request, context: RouteContext) {
  const session = await getSession();

  if (!session) {
    return NextResponse.json({ error: "Sessao expirada. Entre novamente." }, { status: 401 });
  }

  if (!session.permissions.includes("suprimentos.manage")) {
    return NextResponse.json({ error: "Voce nao tem permissao para editar solicitacoes." }, { status: 403 });
  }

  const body = await request.json().catch(() => null);
  const parsed = purchaseRequestSchema.safeParse(body);

  if (!parsed.success) {
    return NextResponse.json({ error: "Revise os campos da solicitacao de compra." }, { status: 400 });
  }

  const { id } = await context.params;
  const input = parsed.data;
  const prisma = getPrisma();

  try {
    const requestRecord = await prisma.$transaction(async (tx) => {
      const current = await tx.purchaseRequest.findUnique({
        where: { id },
        include: {
          items: true,
          quotes: true,
          orders: true
        }
      });

      if (!current) {
        throw new Error("REQUEST_NOT_FOUND");
      }

      if (current.quotes.length > 0 || current.orders.length > 0 || current.status !== "ABERTA") {
        throw new Error("REQUEST_LOCKED");
      }

      await tx.purchaseRequestItem.deleteMany({
        where: { purchaseRequestId: current.id }
      });

      const updated = await tx.purchaseRequest.update({
        where: { id: current.id },
        data: {
          number: normalizeManualCode(input.number) || current.number,
          department: input.department?.trim() || null,
          costCenter: input.costCenter?.trim() || null,
          priority: input.priority,
          neededAt: input.neededAt || null,
          justification: input.justification?.trim() || null,
          items: {
            create: input.items.map((item) => ({
              itemId: item.itemId,
              quantity: new Prisma.Decimal(item.quantity),
              note: item.note?.trim() || null
            }))
          }
        },
        include: {
          requester: true,
          items: true
        }
      });

      await tx.auditLog.create({
        data: {
          userId: session.userId,
          module: "Suprimentos",
          action: AuditAction.UPDATE,
          entity: "PurchaseRequest",
          entityId: updated.id,
          previousValue: {
            number: current.number,
            priority: current.priority,
            itemCount: current.items.length
          },
          newValue: {
            number: updated.number,
            priority: updated.priority,
            itemCount: updated.items.length
          }
        }
      });

      return updated;
    });

    return NextResponse.json({ request: requestRecord });
  } catch (error) {
    if (error instanceof Error && error.message === "REQUEST_NOT_FOUND") {
      return NextResponse.json({ error: "Solicitacao nao encontrada." }, { status: 404 });
    }

    if (error instanceof Error && error.message === "REQUEST_LOCKED") {
      return NextResponse.json({ error: "Solicitacao com cotacao ou pedido nao pode ser editada." }, { status: 409 });
    }

    if (error instanceof Prisma.PrismaClientKnownRequestError && error.code === "P2002") {
      return NextResponse.json({ error: "Ja existe uma solicitacao com este numero." }, { status: 409 });
    }

    return NextResponse.json({ error: "Nao foi possivel editar a solicitacao." }, { status: 500 });
  }
}

export async function DELETE(_request: Request, context: RouteContext) {
  const session = await getSession();

  if (!session) {
    return NextResponse.json({ error: "Sessao expirada. Entre novamente." }, { status: 401 });
  }

  if (!session.permissions.includes("suprimentos.manage")) {
    return NextResponse.json({ error: "Voce nao tem permissao para excluir solicitacoes." }, { status: 403 });
  }

  const { id } = await context.params;
  const prisma = getPrisma();

  try {
    await prisma.$transaction(async (tx) => {
      const current = await tx.purchaseRequest.findUnique({
        where: { id },
        include: {
          items: true,
          quotes: true,
          orders: true
        }
      });

      if (!current) {
        throw new Error("REQUEST_NOT_FOUND");
      }

      if (current.quotes.length > 0 || current.orders.length > 0 || current.status !== "ABERTA") {
        throw new Error("REQUEST_LOCKED");
      }

      await tx.purchaseRequest.delete({
        where: { id: current.id }
      });

      await tx.auditLog.create({
        data: {
          userId: session.userId,
          module: "Suprimentos",
          action: AuditAction.DELETE,
          entity: "PurchaseRequest",
          entityId: current.id,
          previousValue: {
            number: current.number,
            priority: current.priority,
            status: current.status,
            itemCount: current.items.length
          }
        }
      });
    });

    return NextResponse.json({ ok: true });
  } catch (error) {
    if (error instanceof Error && error.message === "REQUEST_NOT_FOUND") {
      return NextResponse.json({ error: "Solicitacao nao encontrada." }, { status: 404 });
    }

    if (error instanceof Error && error.message === "REQUEST_LOCKED") {
      return NextResponse.json({ error: "Solicitacao com cotacao ou pedido nao pode ser excluida." }, { status: 409 });
    }

    return NextResponse.json({ error: "Nao foi possivel excluir a solicitacao." }, { status: 500 });
  }
}
