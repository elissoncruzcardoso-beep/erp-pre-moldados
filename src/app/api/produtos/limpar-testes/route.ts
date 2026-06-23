import { AuditAction, Prisma } from "@prisma/client";
import { apiForbidden, apiSuccess, handleApiError } from "@/lib/api/responses";
import { canRunMaintenanceCleanup, requireApiSession } from "@/lib/auth/guards";
import { getPrisma } from "@/lib/db/prisma";
import { serializableTransaction } from "@/lib/db/transactions";
import { MAINTENANCE_BATCH_LIMIT } from "@/lib/query-limits";

export async function POST(request: Request) {
  const confirmation = request.headers.get("x-cleanup-confirmation");
  const auth = await requireApiSession({
    permission: "manutencao.cleanup",
    forbiddenMessage: "Voce nao tem permissao para limpar produtos de teste."
  });

  if (auth.response) return auth.response;

  if (!canRunMaintenanceCleanup(auth.session)) {
    return apiForbidden("Apenas o Administrador pode executar limpezas destrutivas.");
  }

  if (confirmation !== "LIMPAR_PRODUTOS_TESTE") {
    return handleApiError(new Error("Confirmacao obrigatoria para limpar produtos de teste."), "Confirmacao obrigatoria para limpar produtos de teste.", {
      context: {
        request,
        module: "Produtos",
        action: "validar_limpeza_produtos_teste",
        userId: auth.session.userId,
        entity: "TestProductsCleanup"
      },
      event: "test_products_cleanup_confirmation_error"
    });
  }

  const prisma = getPrisma();

  try {
    const result = await serializableTransaction(prisma, async (tx) => {
      const testItems = await tx.item.findMany({
        where: {
          OR: [
            { code: { startsWith: "TEST-" } },
            { description: { contains: "TESTE", mode: "insensitive" } }
          ]
        },
        select: { id: true, code: true, description: true },
        take: MAINTENANCE_BATCH_LIMIT + 1
      });

      if (testItems.length > MAINTENANCE_BATCH_LIMIT) {
        throw new Error(`Limpeza bloqueada: mais de ${MAINTENANCE_BATCH_LIMIT} itens de teste encontrados.`);
      }

      const testItemIds = testItems.map((item) => item.id);

      const testCompositions = await tx.composition.findMany({
        where: {
          OR: [
            { code: { startsWith: "TEST-COMP-" } },
            { productId: { in: testItemIds } },
            { items: { some: { itemId: { in: testItemIds } } } }
          ]
        },
        select: { id: true, code: true },
        take: MAINTENANCE_BATCH_LIMIT + 1
      });

      if (testCompositions.length > MAINTENANCE_BATCH_LIMIT) {
        throw new Error(`Limpeza bloqueada: mais de ${MAINTENANCE_BATCH_LIMIT} composicoes de teste encontradas.`);
      }

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
    return handleApiError(error, "Nao foi possivel limpar produtos de teste.", {
      context: {
        request,
        module: "Produtos",
        action: "limpar_produtos_teste",
        userId: auth.session.userId,
        entity: "TestProductsCleanup"
      },
      event: "test_products_cleanup_error"
    });
  }
}
