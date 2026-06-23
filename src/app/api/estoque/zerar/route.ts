import { AuditAction, Prisma } from "@prisma/client";
import { apiForbidden, apiSuccess, handleApiError } from "@/lib/api/responses";
import { canRunMaintenanceCleanup, requireApiSession } from "@/lib/auth/guards";
import { getPrisma } from "@/lib/db/prisma";
import { serializableTransaction } from "@/lib/db/transactions";

export async function POST(request: Request) {
  const confirmation = request.headers.get("x-cleanup-confirmation");
  const auth = await requireApiSession({
    permission: "manutencao.cleanup",
    forbiddenMessage: "Voce nao tem permissao para zerar o estoque."
  });

  if (auth.response) return auth.response;

  if (!canRunMaintenanceCleanup(auth.session)) {
    return apiForbidden("Apenas o Administrador pode executar limpezas destrutivas.");
  }

  if (confirmation !== "ZERAR_ESTOQUE") {
    return handleApiError(new Error("Confirmacao obrigatoria para zerar estoque."), "Confirmacao obrigatoria para zerar estoque.", {
      context: {
        request,
        module: "Estoque",
        action: "validar_zeramento_estoque",
        userId: auth.session.userId,
        entity: "StockCleanup"
      },
      event: "stock_cleanup_confirmation_error"
    });
  }

  const prisma = getPrisma();

  try {
    const result = await serializableTransaction(prisma, async (tx) => {
      const [balancesBefore, movementsBefore, lotsBefore] = await Promise.all([
        tx.stockBalance.count(),
        tx.stockMovement.count(),
        tx.lot.count()
      ]);

      await tx.directSale.updateMany({
        where: { stockMovementId: { not: null } },
        data: {
          stockMovementId: null,
          consumedLots: Prisma.DbNull
        }
      });

      await tx.purchaseReceipt.updateMany({
        where: {
          OR: [
            { stockMovementId: { not: null } },
            { lotId: { not: null } }
          ]
        },
        data: {
          stockMovementId: null,
          lotId: null
        }
      });

      const balances = await tx.stockBalance.deleteMany();
      const movements = await tx.stockMovement.deleteMany();
      const lots = await tx.lot.deleteMany();

      await tx.auditLog.create({
        data: {
          userId: auth?.session.userId,
          module: "Estoque",
          action: AuditAction.DELETE,
          entity: "StockCleanup",
          entityId: "estoque-zerado",
          previousValue: {
            balances: balancesBefore,
            movements: movementsBefore,
            lots: lotsBefore
          },
          newValue: {
            balancesDeleted: balances.count,
            movementsDeleted: movements.count,
            lotsDeleted: lots.count,
            reason: "Zeramento inicial para implantacao do ERP"
          },
          justification: "Zeramento inicial para implantacao do ERP"
        }
      });

      return {
        balancesDeleted: balances.count,
        movementsDeleted: movements.count,
        lotsDeleted: lots.count
      };
    });

    return apiSuccess({ cleanup: result });
  } catch (error) {
    return handleApiError(error, "Nao foi possivel zerar o estoque.", {
      context: {
        request,
        module: "Estoque",
        action: "zerar_estoque",
        userId: auth.session.userId,
        entity: "StockCleanup"
      },
      event: "stock_cleanup_error"
    });
  }
}
