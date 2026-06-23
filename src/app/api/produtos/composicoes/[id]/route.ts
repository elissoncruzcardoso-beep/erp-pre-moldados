import { AuditAction, Prisma } from "@prisma/client";
import {
  apiConflict,
  apiError,
  apiSuccess,
  apiValidationError,
  handleApiError
} from "@/lib/api/responses";
import { requireApiSession } from "@/lib/auth/guards";
import { normalizeManualCode } from "@/lib/codes/auto-code";
import { getPrisma } from "@/lib/db/prisma";
import { serializableTransaction } from "@/lib/db/transactions";
import { compositionSchema } from "@/lib/validations/product";

type RouteContext = {
  params: Promise<{ id: string }>;
};

async function requireProductManager() {
  return requireApiSession({
    permission: "produtos.manage",
    forbiddenMessage: "Voce nao tem permissao para alterar composicoes."
  });
}

export async function PATCH(request: Request, context: RouteContext) {
  const auth = await requireProductManager();

  if (auth.response) return auth.response;

  const { id } = await context.params;
  const body = await request.json().catch(() => null);
  const parsed = compositionSchema.safeParse(body);

  if (!parsed.success) {
    return apiValidationError("Revise os campos da ficha tecnica.", parsed.error.flatten());
  }

  const input = parsed.data;
  const prisma = getPrisma();

  try {
    const composition = await serializableTransaction(prisma, async (tx) => {
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

    return apiSuccess({ composition });
  } catch (error) {
    if (error instanceof Prisma.PrismaClientKnownRequestError && error.code === "P2002") {
      return apiConflict("Ja existe uma composicao com este codigo.");
    }

    const messages: Record<string, string> = {
      COMPOSITION_NOT_FOUND: "Ficha tecnica nao encontrada.",
      COMPOSITION_IN_USE: "Ficha tecnica com ordem de producao vinculada nao pode ser alterada.",
      PRODUCT_NOT_FOUND: "Peca/produto nao encontrado.",
      INVALID_PRODUCT_TYPE: "A composicao deve ser vinculada a peca pre-moldada ou produto acabado.",
      INVALID_MATERIAL: "Use apenas insumos ou materias-primas ativos na composicao."
    };
    const message =
      error instanceof Error && messages[error.message]
        ? messages[error.message]
        : "Nao foi possivel alterar a composicao.";

    if (error instanceof Error && messages[error.message]) {
      return apiError(message, { status: 400 });
    }

    return handleApiError(error, "Nao foi possivel alterar a composicao.", {
      context: {
        request,
        module: "Produtos",
        action: "alterar_composicao",
        userId: auth.session.userId,
        entity: "Composition"
      },
      event: "composition_update_error"
    });
  }
}

export async function DELETE(request: Request, context: RouteContext) {
  const auth = await requireProductManager();

  if (auth.response) return auth.response;

  const { id } = await context.params;
  const prisma = getPrisma();

  try {
    await serializableTransaction(prisma, async (tx) => {
      const current = await tx.composition.findUnique({
        where: { id },
        include: { orders: true }
      });

      if (!current) {
        throw new Error("COMPOSITION_NOT_FOUND");
      }

      const isTestComposition = current.code.startsWith("TEST-COMP-");

      if (current.orders.length > 0 && !isTestComposition) {
        throw new Error("COMPOSITION_IN_USE");
      }

      if (isTestComposition && current.orders.length > 0) {
        await tx.productionOrder.deleteMany({ where: { compositionId: id } });
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
            code: current.code,
            removedLinkedOrders: isTestComposition ? current.orders.length : 0
          }
        }
      });
    });

    return apiSuccess({});
  } catch (error) {
    const messages: Record<string, string> = {
      COMPOSITION_NOT_FOUND: "Ficha tecnica nao encontrada.",
      COMPOSITION_IN_USE: "Ficha tecnica com ordem de producao vinculada nao pode ser excluida."
    };
    const message =
      error instanceof Error && messages[error.message]
        ? messages[error.message]
        : "Nao foi possivel excluir a composicao.";

    if (error instanceof Error && messages[error.message]) {
      return apiError(message, { status: 400 });
    }

    return handleApiError(error, message, {
      context: {
        request,
        module: "Produtos",
        action: "excluir_composicao",
        userId: auth.session.userId,
        entity: "Composition"
      },
      event: "composition_delete_error"
    });
  }
}
