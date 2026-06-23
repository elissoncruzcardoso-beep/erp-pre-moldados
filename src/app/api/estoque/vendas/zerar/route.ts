import { AuditAction } from "@prisma/client";
import { apiForbidden, apiSuccess, handleApiError } from "@/lib/api/responses";
import { canRunMaintenanceCleanup, requireApiSession } from "@/lib/auth/guards";
import { getPrisma } from "@/lib/db/prisma";
import { serializableTransaction } from "@/lib/db/transactions";

export async function POST(request: Request) {
  const confirmation = request.headers.get("x-cleanup-confirmation");
  const auth = await requireApiSession({
    permission: "manutencao.cleanup",
    forbiddenMessage: "Voce nao tem permissao para limpar vendas."
  });

  if (auth.response) return auth.response;

  if (!canRunMaintenanceCleanup(auth.session)) {
    return apiForbidden("Apenas o Administrador pode executar limpezas destrutivas.");
  }

  if (confirmation !== "ZERAR_VENDAS") {
    return handleApiError(new Error("Confirmacao obrigatoria para limpar vendas."), "Confirmacao obrigatoria para limpar vendas.", {
      context: {
        request,
        module: "Vendas",
        action: "validar_limpeza_vendas",
        userId: auth.session.userId,
        entity: "SalesCleanup"
      },
      event: "sales_cleanup_confirmation_error"
    });
  }

  const prisma = getPrisma();

  try {
    const result = await serializableTransaction(prisma, async (tx) => {
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
    return handleApiError(error, "Nao foi possivel limpar o modulo de vendas.", {
      context: {
        request,
        module: "Vendas",
        action: "limpar_vendas",
        userId: auth.session.userId,
        entity: "SalesCleanup"
      },
      event: "sales_cleanup_error"
    });
  }
}
