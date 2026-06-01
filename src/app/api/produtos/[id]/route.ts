import { AuditAction } from "@prisma/client";
import { z } from "zod";
import { apiError, apiSuccess, apiValidationError } from "@/lib/api/responses";
import { requireApiSession } from "@/lib/auth/guards";
import { getPrisma } from "@/lib/db/prisma";
import { calculateBatchReadyAt } from "@/lib/production/auto-release-cured-batches";

type RouteContext = {
  params: Promise<{ id: string }>;
};

const productUpdateSchema = z.object({
  curingHours: z.coerce.number().int().min(0).max(720).optional()
});

export async function PATCH(request: Request, context: RouteContext) {
  const auth = await requireApiSession({
    anyPermission: ["produtos.manage", "cadastros.manage"],
    forbiddenMessage: "Voce nao tem permissao para alterar produtos."
  });

  if (auth.response) return auth.response;

  const { id } = await context.params;
  const body = await request.json().catch(() => null);
  const parsed = productUpdateSchema.safeParse(body);

  if (!parsed.success || parsed.data.curingHours === undefined) {
    return apiValidationError("Informe um tempo de cura valido.", parsed.success ? undefined : parsed.error.flatten());
  }

  const prisma = getPrisma();
  const curingHours = parsed.data.curingHours;

  try {
    const result = await prisma.$transaction(async (tx) => {
      const current = await tx.item.findUnique({ where: { id } });

      if (!current) {
        throw new Error("Produto nao encontrado.");
      }

      if (current.type !== "PECA_PRE_MOLDADA" && current.type !== "PRODUTO_ACABADO") {
        throw new Error("Tempo de cura so pode ser alterado para peca pre-moldada ou produto acabado.");
      }

      const item = await tx.item.update({
        where: { id },
        data: {
          curingHours
        }
      });

      const openBatches = await tx.productionBatch.findMany({
        where: {
          itemId: id,
          status: { in: ["EM_CURA", "RETIRADA_PARCIAL"] },
          autoStockedAt: null
        },
        select: {
          id: true,
          producedAt: true
        }
      });

      for (const batch of openBatches) {
        await tx.productionBatch.update({
          where: { id: batch.id },
          data: {
            readyAt: calculateBatchReadyAt(batch.producedAt, curingHours)
          }
        });
      }

      await tx.auditLog.create({
        data: {
          userId: auth.session.userId,
          module: "Produtos",
          action: AuditAction.UPDATE,
          entity: "Item",
          entityId: item.id,
          previousValue: {
            curingHours: current.curingHours
          },
          newValue: {
            curingHours: item.curingHours,
            recalculatedOpenBatches: openBatches.length
          }
        }
      });

      return { item, recalculatedOpenBatches: openBatches.length };
    });

    return apiSuccess(result);
  } catch (error) {
    const message = error instanceof Error ? error.message : "Nao foi possivel atualizar o produto.";
    return apiError(message, { status: 400 });
  }
}
