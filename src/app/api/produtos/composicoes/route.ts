import { AuditAction, Prisma } from "@prisma/client";
import {
  apiConflict,
  apiError,
  apiSuccess,
  apiValidationError,
  handleApiError
} from "@/lib/api/responses";
import { requireApiSession } from "@/lib/auth/guards";
import { makeAutomaticCode, normalizeManualCode } from "@/lib/codes/auto-code";
import { getPrisma } from "@/lib/db/prisma";
import { serializableTransaction } from "@/lib/db/transactions";
import { compositionSchema } from "@/lib/validations/product";

export async function POST(request: Request) {
  const auth = await requireApiSession({
    permission: "produtos.manage",
    forbiddenMessage: "Voce nao tem permissao para cadastrar composicoes."
  });

  if (auth.response) return auth.response;

  const body = await request.json().catch(() => null);
  const parsed = compositionSchema.safeParse(body);

  if (!parsed.success) {
    return apiValidationError("Revise os campos da ficha tecnica.", parsed.error.flatten());
  }

  const input = parsed.data;
  const prisma = getPrisma();

  try {
    const composition = await serializableTransaction(prisma, async (tx) => {
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

      const created = await tx.composition.create({
        data: {
          code: normalizeManualCode(input.code) || makeAutomaticCode(`COMP-${product.code}`),
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
          items: {
            include: {
              item: true
            }
          }
        }
      });

      await tx.auditLog.create({
        data: {
          userId: auth.session.userId,
          module: "Produtos",
          action: AuditAction.CREATE,
          entity: "Composition",
          entityId: created.id,
          newValue: {
            code: created.code,
            product: created.product.code,
            curingHours: created.curingHours,
            items: created.items.length,
            approved: created.approved
          }
        }
      });

      return created;
    });

    return apiSuccess({ composition }, { status: 201 });
  } catch (error) {
    if (error instanceof Prisma.PrismaClientKnownRequestError && error.code === "P2002") {
      return apiConflict("Ja existe uma composicao com este codigo.");
    }

    const messages: Record<string, string> = {
      PRODUCT_NOT_FOUND: "Peca/produto nao encontrado.",
      INVALID_PRODUCT_TYPE: "A composicao deve ser vinculada a peca pre-moldada ou produto acabado.",
      INVALID_MATERIAL: "Use apenas insumos ou materias-primas ativos na composicao."
    };
    const message =
      error instanceof Error && messages[error.message]
        ? messages[error.message]
        : "Nao foi possivel criar a composicao.";

    if (error instanceof Error && messages[error.message]) {
      return apiError(message, { status: 400 });
    }

    return handleApiError(error, "Nao foi possivel criar a composicao.", {
      context: {
        request,
        module: "Produtos",
        action: "criar_composicao",
        userId: auth.session.userId,
        entity: "Composition"
      },
      event: "composition_create_error"
    });
  }
}
