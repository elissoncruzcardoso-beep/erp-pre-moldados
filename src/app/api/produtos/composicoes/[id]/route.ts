import { NextResponse } from "next/server";
import { AuditAction, Prisma } from "@prisma/client";
import { getSession } from "@/lib/auth/session";
import { normalizeManualCode } from "@/lib/codes/auto-code";
import { getPrisma } from "@/lib/db/prisma";
import { compositionSchema } from "@/lib/validations/product";

type RouteContext = {
  params: Promise<{ id: string }>;
};

async function requireProductManager() {
  const session = await getSession();

  if (!session) {
    return { response: NextResponse.json({ error: "Sessao expirada. Entre novamente." }, { status: 401 }) };
  }

  if (!session.permissions.includes("produtos.manage")) {
    return { response: NextResponse.json({ error: "Voce nao tem permissao para alterar composicoes." }, { status: 403 }) };
  }

  return { session };
}

export async function PATCH(request: Request, context: RouteContext) {
  const auth = await requireProductManager();

  if (auth.response) return auth.response;

  const { id } = await context.params;
  const body = await request.json().catch(() => null);
  const parsed = compositionSchema.safeParse(body);

  if (!parsed.success) {
    return NextResponse.json({ error: "Revise os campos da ficha tecnica." }, { status: 400 });
  }

  const input = parsed.data;
  const prisma = getPrisma();

  try {
    const composition = await prisma.$transaction(async (tx) => {
      const current = await tx.composition.findUnique({
        where: { id },
        include: { orders: true }
      });

      if (!current) {
        throw new Error("COMPOSITION_NOT_FOUND");
      }

      if (current.orders.length > 0) {
        throw new Error("COMPOSITION_IN_USE");
      }

      const product = await tx.item.findUnique({ where: { id: input.productId } });

      if (!product) {
        throw new Error("PRODUCT_NOT_FOUND");
      }

      if (product.type !== "PECA_PRE_MOLDADA" && product.type !== "PRODUTO_ACABADO") {
        throw new Error("INVALID_PRODUCT_TYPE");
      }

      const materialCount = await tx.item.count({
        where: {
          id: { in: input.items.map((item) => item.itemId) },
          type: { in: ["MATERIA_PRIMA", "INSUMO"] },
          active: true
        }
      });

      if (materialCount !== new Set(input.items.map((item) => item.itemId)).size) {
        throw new Error("INVALID_MATERIAL");
      }

      await tx.compositionItem.deleteMany({ where: { compositionId: id } });

      const updated = await tx.composition.update({
        where: { id },
        data: {
          code: normalizeManualCode(input.code) || current.code,
          productId: input.productId,
          version: input.version.trim(),
          revision: input.revision.trim().toUpperCase(),
          baseQuantity: new Prisma.Decimal(input.baseQuantity),
          expectedLoss: new Prisma.Decimal(input.expectedLoss),
          curingHours: input.curingHours ?? product.curingHours,
          approved: input.approved,
          items: {
            create: input.items.map((item) => ({
              itemId: item.itemId,
              quantity: new Prisma.Decimal(item.quantity),
              lossPercent: new Prisma.Decimal(item.lossPercent),
              stage: item.stage?.trim() || null
            }))
          }
        },
        include: {
          product: true,
          items: true
        }
      });

      await tx.auditLog.create({
        data: {
          userId: auth.session.userId,
          module: "Produtos",
          action: AuditAction.UPDATE,
          entity: "Composition",
          entityId: updated.id,
          newValue: {
            code: updated.code,
            product: updated.product.code,
            curingHours: updated.curingHours,
            items: updated.items.length,
            approved: updated.approved
          }
        }
      });

      return updated;
    });

    return NextResponse.json({ composition });
  } catch (error) {
    if (error instanceof Prisma.PrismaClientKnownRequestError && error.code === "P2002") {
      return NextResponse.json({ error: "Ja existe uma composicao com este codigo." }, { status: 409 });
    }

    const messages: Record<string, string> = {
      COMPOSITION_NOT_FOUND: "Ficha tecnica nao encontrada.",
      COMPOSITION_IN_USE: "Ficha tecnica com ordem de producao vinculada nao pode ser alterada.",
      PRODUCT_NOT_FOUND: "Peca/produto nao encontrado.",
      INVALID_PRODUCT_TYPE: "A composicao deve ser vinculada a peca pre-moldada ou produto acabado.",
      INVALID_MATERIAL: "Use apenas insumos ou materias-primas ativos na composicao."
    };
    const message = error instanceof Error ? messages[error.message] || error.message : "Nao foi possivel alterar a composicao.";

    return NextResponse.json({ error: message }, { status: 400 });
  }
}

export async function DELETE(_request: Request, context: RouteContext) {
  const auth = await requireProductManager();

  if (auth.response) return auth.response;

  const { id } = await context.params;
  const prisma = getPrisma();

  try {
    await prisma.$transaction(async (tx) => {
      const current = await tx.composition.findUnique({
        where: { id },
        include: { orders: true }
      });

      if (!current) {
        throw new Error("COMPOSITION_NOT_FOUND");
      }

      if (current.orders.length > 0) {
        throw new Error("COMPOSITION_IN_USE");
      }

      await tx.composition.delete({ where: { id } });

      await tx.auditLog.create({
        data: {
          userId: auth.session.userId,
          module: "Produtos",
          action: AuditAction.DELETE,
          entity: "Composition",
          entityId: id,
          previousValue: {
            code: current.code
          }
        }
      });
    });

    return NextResponse.json({ ok: true });
  } catch (error) {
    const messages: Record<string, string> = {
      COMPOSITION_NOT_FOUND: "Ficha tecnica nao encontrada.",
      COMPOSITION_IN_USE: "Ficha tecnica com ordem de producao vinculada nao pode ser excluida."
    };
    const message = error instanceof Error ? messages[error.message] || error.message : "Nao foi possivel excluir a composicao.";

    return NextResponse.json({ error: message }, { status: 400 });
  }
}
