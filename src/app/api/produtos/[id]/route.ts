import { AuditAction, Prisma } from "@prisma/client";
import { z } from "zod";
import { apiConflict, apiError, apiSuccess, apiValidationError, handleApiError } from "@/lib/api/responses";
import { requireApiSession } from "@/lib/auth/guards";
import { normalizeManualCode } from "@/lib/codes/auto-code";
import { getPrisma } from "@/lib/db/prisma";
import { serializableTransaction } from "@/lib/db/transactions";
import { calculateBatchReadyAt } from "@/lib/production/auto-release-cured-batches";
import { MAINTENANCE_BATCH_LIMIT } from "@/lib/query-limits";
import { itemTypeSchema } from "@/lib/validations/product";

type RouteContext = {
  params: Promise<{ id: string }>;
};

const productUpdateSchema = z.object({
  code: z.string().min(2).max(40).optional(),
  description: z.string().min(3).max(180).optional(),
  type: itemTypeSchema.optional(),
  group: z.string().max(80).optional(),
  unitId: z.string().min(1).optional(),
  controlsStock: z.boolean().optional(),
  controlsLot: z.boolean().optional(),
  minimumStock: z.coerce.number().min(0).optional(),
  standardCost: z.coerce.number().min(0).optional(),
  curingHours: z.coerce.number().int().min(0).max(720).optional(),
  active: z.boolean().optional()
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

  if (!parsed.success) {
    return apiValidationError("Revise os campos do produto.", parsed.error.flatten());
  }

  const prisma = getPrisma();
  const input = parsed.data;

  try {
    const result = await serializableTransaction(prisma, async (tx) => {
      const current = await tx.item.findUnique({ where: { id } });

      if (!current) {
        throw new Error("Produto nao encontrado.");
      }

      const nextType = input.type || current.type;
      const usesCuring = nextType === "PECA_PRE_MOLDADA" || nextType === "PRODUTO_ACABADO";

      if (input.curingHours !== undefined && input.curingHours > 0 && !usesCuring) {
        throw new Error("Tempo de cura so pode ser alterado para peca pre-moldada ou produto acabado.");
      }

      const data: Prisma.ItemUpdateInput = {
        ...(input.code !== undefined ? { code: normalizeManualCode(input.code) || current.code } : {}),
        ...(input.description !== undefined ? { description: input.description.trim() } : {}),
        ...(input.type !== undefined ? { type: input.type } : {}),
        ...(input.group !== undefined ? { group: input.group.trim() || null } : {}),
        ...(input.unitId !== undefined ? { unit: { connect: { id: input.unitId } } } : {}),
        ...(input.controlsStock !== undefined ? { controlsStock: input.controlsStock } : {}),
        ...(input.controlsLot !== undefined ? { controlsLot: input.controlsLot } : {}),
        ...(input.minimumStock !== undefined ? { minimumStock: new Prisma.Decimal(input.minimumStock) } : {}),
        ...(input.standardCost !== undefined ? { standardCost: new Prisma.Decimal(input.standardCost) } : {}),
        ...(input.active !== undefined ? { active: input.active } : {}),
        curingHours: usesCuring ? input.curingHours ?? current.curingHours : 0
      };

      const item = await tx.item.update({
        where: { id },
        data
      });

      let recalculatedOpenBatches = 0;
      let cursor: string | undefined;

      while (true) {
        const openBatches = await tx.productionBatch.findMany({
          where: {
            itemId: id,
            status: { in: ["EM_CURA", "RETIRADA_PARCIAL"] },
            autoStockedAt: null
          },
          select: {
            id: true,
            producedAt: true
          },
          orderBy: { id: "asc" },
          ...(cursor ? { cursor: { id: cursor }, skip: 1 } : {}),
          take: MAINTENANCE_BATCH_LIMIT
        });

        if (openBatches.length === 0) {
          break;
        }

        for (const batch of openBatches) {
          await tx.productionBatch.update({
            where: { id: batch.id },
            data: {
              readyAt: calculateBatchReadyAt(batch.producedAt, item.curingHours)
            }
          });
        }

        recalculatedOpenBatches += openBatches.length;
        cursor = openBatches.at(-1)?.id;
      }

      await tx.auditLog.create({
        data: {
          userId: auth.session.userId,
          module: "Produtos",
          action: AuditAction.UPDATE,
          entity: "Item",
          entityId: item.id,
          previousValue: {
            code: current.code,
            description: current.description,
            type: current.type,
            active: current.active,
            curingHours: current.curingHours
          },
          newValue: {
            code: item.code,
            description: item.description,
            type: item.type,
            active: item.active,
            curingHours: item.curingHours,
            recalculatedOpenBatches
          }
        }
      });

      return { item, recalculatedOpenBatches };
    });

    return apiSuccess(result);
  } catch (error) {
    if (error instanceof Prisma.PrismaClientKnownRequestError && error.code === "P2002") {
      return apiConflict("Ja existe um produto com este codigo.");
    }

    return handleApiError(error, "Nao foi possivel atualizar o produto.", {
      context: {
        request,
        module: "Produtos",
        action: "atualizar_produto",
        userId: auth.session.userId,
        entity: "Item"
      },
      event: "product_update_error"
    });
  }
}

export async function DELETE(request: Request, context: RouteContext) {
  const auth = await requireApiSession({
    anyPermission: ["produtos.manage", "cadastros.manage"],
    forbiddenMessage: "Voce nao tem permissao para alterar produtos."
  });

  if (auth.response) return auth.response;

  const { id } = await context.params;
  const prisma = getPrisma();

  try {
    const current = await prisma.item.findUnique({
      where: { id },
      include: {
        _count: {
          select: {
            lots: true,
            stockBalances: true,
            stockMovements: true,
            purchaseRequestItems: true,
            purchaseQuoteItems: true,
            purchaseOrderItems: true,
            compositionsAsProduct: true,
            compositionItems: true,
            productionOrders: true,
            productionDailyLogItems: true,
            productionBatches: true,
            directSales: true
          }
        }
      }
    });

    if (!current) {
      return apiError("Produto nao encontrado.", { status: 404 });
    }

    const linkedCount = Object.values(current._count).reduce((sum, value) => sum + value, 0);

    if (linkedCount > 0) {
      const item = await prisma.item.update({
        where: { id },
        data: { active: !current.active }
      });

      await prisma.auditLog.create({
        data: {
          userId: auth.session.userId,
          module: "Produtos",
          action: AuditAction.UPDATE,
          entity: "Item",
          entityId: item.id,
          previousValue: { active: current.active },
          newValue: { active: item.active, linkedCount, mode: "toggle-active" }
        }
      }).catch(() => null);

      return apiSuccess({ item, mode: "toggle-active" });
    }

    await prisma.item.delete({ where: { id } });

    await prisma.auditLog.create({
      data: {
        userId: auth.session.userId,
        module: "Produtos",
        action: AuditAction.DELETE,
        entity: "Item",
        entityId: id,
        previousValue: {
          code: current.code,
          description: current.description
        }
      }
    }).catch(() => null);

    return apiSuccess({ deleted: true, mode: "delete" });
  } catch (error) {
    return handleApiError(error, "Nao foi possivel excluir ou inativar o produto.", {
      context: {
        request,
        module: "Produtos",
        action: "excluir_ou_inativar_produto",
        userId: auth.session.userId,
        entity: "Item"
      },
      event: "product_delete_error"
    });
  }
}
