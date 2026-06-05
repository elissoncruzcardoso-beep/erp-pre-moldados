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
        anyPermission: ["estoque.adjust", "estoque.move"],
        forbiddenMessage: "Voce nao tem permissao para zerar o estoque."
      });

  if (auth?.response) return auth.response;

  if (confirmation !== "ZERAR_ESTOQUE") {
    return handleApiError(new Error("Confirmacao obrigatoria para zerar estoque."), "Confirmacao obrigatoria para zerar estoque.");
  }

  const prisma = getPrisma();

  try {
    const result = await prisma.$transaction(async (tx) => {
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
    return handleApiError(error, "Nao foi possivel zerar o estoque.");
  }
}
