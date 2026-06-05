import { AuditAction } from "@prisma/client";
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
        anyPermission: ["estoque.adjust", "financeiro.manage"],
        forbiddenMessage: "Voce nao tem permissao para limpar vendas."
      });

  if (auth?.response) return auth.response;

  if (confirmation !== "ZERAR_VENDAS") {
    return handleApiError(new Error("Confirmacao obrigatoria para limpar vendas."), "Confirmacao obrigatoria para limpar vendas.");
  }

  const prisma = getPrisma();

  try {
    const result = await prisma.$transaction(async (tx) => {
      const [salesBefore, receivablesBefore, receiptsBefore] = await Promise.all([
        tx.directSale.count(),
        tx.accountReceivable.count({ where: { directSaleId: { not: null } } }),
        tx.accountReceipt.count({
          where: {
            accountReceivable: {
              directSaleId: { not: null }
            }
          }
        })
      ]);

      const receipts = await tx.accountReceipt.deleteMany({
        where: {
          accountReceivable: {
            directSaleId: { not: null }
          }
        }
      });

      const receivables = await tx.accountReceivable.deleteMany({
        where: {
          directSaleId: { not: null }
        }
      });

      const sales = await tx.directSale.deleteMany();

      await tx.auditLog.create({
        data: {
          userId: auth?.session.userId,
          module: "Vendas",
          action: AuditAction.DELETE,
          entity: "SalesCleanup",
          entityId: "vendas-zeradas",
          previousValue: {
            directSales: salesBefore,
            saleReceivables: receivablesBefore,
            saleReceipts: receiptsBefore
          },
          newValue: {
            directSalesDeleted: sales.count,
            saleReceivablesDeleted: receivables.count,
            saleReceiptsDeleted: receipts.count,
            reason: "Zeramento inicial para implantacao do ERP"
          },
          justification: "Zeramento inicial para implantacao do ERP"
        }
      });

      return {
        directSalesDeleted: sales.count,
        saleReceivablesDeleted: receivables.count,
        saleReceiptsDeleted: receipts.count
      };
    });

    return apiSuccess({ cleanup: result });
  } catch (error) {
    return handleApiError(error, "Nao foi possivel limpar o modulo de vendas.");
  }
}
