import { AuditAction, Prisma } from "@prisma/client";
import { apiSuccess, handleApiError } from "@/lib/api/responses";
import { requireApiSession } from "@/lib/auth/guards";
import { getPrisma } from "@/lib/db/prisma";

export async function POST(request: Request) {
  const cleanupSecret = request.headers.get("x-cleanup-secret");
  const confirmation = request.headers.get("x-cleanup-confirmation");
  const canUseSecret = Boolean(process.env.CRON_SECRET) && cleanupSecret === process.env.CRON_SECRET;
  const auth = canUseSecret
    ? null
    : await requireApiSession({
        anyPermission: ["produtos.manage", "cadastros.manage"],
        forbiddenMessage: "Voce nao tem permissao para limpar produtos de teste."
      });

  if (auth?.response) return auth.response;

  if (confirmation !== "LIMPAR_PRODUTOS_TESTE") {
    return handleApiError(new Error("Confirmacao obrigatoria para limpar produtos de teste."), "Confirmacao obrigatoria para limpar produtos de teste.");
  }

  const prisma = getPrisma();

  try {
    const result = await prisma.$transaction(async (tx) => {
      const testItems = await tx.item.findMany({
        where: {
          OR: [
            { code: { startsWith: "TEST-" } },
            { description: { contains: "TESTE", mode: "insensitive" } }
          ]
        },
        select: { id: true, code: true, description: true }
      });
      const testItemIds = testItems.map((item) => item.id);

      const testCompositions = await tx.composition.findMany({
        where: {
          OR: [
            { code: { startsWith: "TEST-COMP-" } },
            { productId: { in: testItemIds } },
            { items: { some: { itemId: { in: testItemIds } } } }
          ]
        },
        select: { id: true, code: true }
      });
      const testCompositionIds = testCompositions.map((composition) => composition.id);

      const productionOrders = await tx.productionOrder.deleteMany({
        where: {
          OR: [
            { productId: { in: testItemIds } },
            { compositionId: { in: testCompositionIds } }
          ]
        }
      });

      const dailyLogItems = await tx.productionDailyLogItem.deleteMany({
        where: { itemId: { in: testItemIds } }
      });

      const directSales = await tx.directSale.deleteMany({
        where: { itemId: { in: testItemIds } }
      });

      const purchaseRequestItems = await tx.purchaseRequestItem.deleteMany({
        where: { itemId: { in: testItemIds } }
      });
      const purchaseQuoteItems = await tx.purchaseQuoteItem.deleteMany({
        where: { itemId: { in: testItemIds } }
      });
      const purchaseOrderItems = await tx.purchaseOrderItem.deleteMany({
        where: { itemId: { in: testItemIds } }
      });

      await tx.stockMovement.deleteMany({ where: { itemId: { in: testItemIds } } });
      await tx.stockBalance.deleteMany({ where: { itemId: { in: testItemIds } } });
      await tx.lot.deleteMany({ where: { itemId: { in: testItemIds } } });

      const compositions = await tx.composition.deleteMany({
        where: { id: { in: testCompositionIds } }
      });

      const items = await tx.item.deleteMany({
        where: { id: { in: testItemIds } }
      });

      await tx.auditLog.create({
        data: {
          userId: auth?.session.userId,
          module: "Produtos",
          action: AuditAction.DELETE,
          entity: "TestProductsCleanup",
          entityId: "produtos-teste-limpos",
          previousValue: {
            items: testItems.map((item) => ({ code: item.code, description: item.description })),
            compositions: testCompositions.map((composition) => composition.code)
          },
          newValue: {
            itemsDeleted: items.count,
            compositionsDeleted: compositions.count,
            productionOrdersDeleted: productionOrders.count,
            dailyLogItemsDeleted: dailyLogItems.count,
            directSalesDeleted: directSales.count,
            purchaseRequestItemsDeleted: purchaseRequestItems.count,
            purchaseQuoteItemsDeleted: purchaseQuoteItems.count,
            purchaseOrderItemsDeleted: purchaseOrderItems.count
          },
          justification: "Remocao de pecas e insumos de teste antes da implantacao"
        }
      });

      return {
        itemsDeleted: items.count,
        compositionsDeleted: compositions.count,
        productionOrdersDeleted: productionOrders.count
      };
    });

    return apiSuccess({ cleanup: result });
  } catch (error) {
    return handleApiError(error, "Nao foi possivel limpar produtos de teste.");
  }
}
