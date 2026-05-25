import { AuditAction, Prisma } from "@prisma/client";
import { getPrisma } from "@/lib/db/prisma";

type AutoReleaseCuredBatchesInput = {
  userId: string;
  responsible?: string;
  now?: Date;
  limit?: number;
};

function addHours(date: Date, hours: number) {
  return new Date(date.getTime() + hours * 60 * 60 * 1000);
}

async function addFinishedGoodsBalance(
  tx: Prisma.TransactionClient,
  itemId: string,
  warehouseId: string,
  lotId: string,
  quantity: Prisma.Decimal
) {
  const currentBalance = await tx.stockBalance.findFirst({
    where: {
      itemId,
      warehouseId,
      lotId
    }
  });

  if (currentBalance) {
    return tx.stockBalance.update({
      where: { id: currentBalance.id },
      data: { quantity: currentBalance.quantity.plus(quantity) }
    });
  }

  return tx.stockBalance.create({
    data: {
      itemId,
      warehouseId,
      lotId,
      quantity
    }
  });
}

export async function autoReleaseCuredBatches({
  userId,
  responsible = "Sistema - cura automatica",
  now = new Date(),
  limit = 80
}: AutoReleaseCuredBatchesInput) {
  const prisma = getPrisma();

  return prisma.$transaction(async (tx) => {
    const finishedWarehouse = await tx.warehouse.findUnique({ where: { code: "PA" } });

    if (!finishedWarehouse || !finishedWarehouse.active) {
      return { checked: 0, released: 0, skippedReason: "Deposito PA nao encontrado ou inativo." };
    }

    const batches = await tx.productionBatch.findMany({
      where: {
        status: { in: ["EM_CURA", "RETIRADA_PARCIAL"] },
        curingQuantity: { gt: 0 },
        autoStockedAt: null
      },
      include: {
        item: true
      },
      orderBy: [{ producedAt: "asc" }, { code: "asc" }],
      take: limit
    });

    let released = 0;

    for (const batch of batches) {
      const effectiveReadyAt = batch.readyAt ?? addHours(batch.producedAt, batch.item.curingHours);

      if (effectiveReadyAt.getTime() > now.getTime()) {
        continue;
      }

      const releaseQuantity = batch.curingQuantity;
      const nextReleasedQuantity = batch.releasedQuantity.plus(releaseQuantity);
      const productionLot = await tx.lot.upsert({
        where: { code: batch.code },
        update: {
          itemId: batch.itemId,
          manufacturedAt: batch.producedAt,
          status: "LIBERADO"
        },
        create: {
          code: batch.code,
          itemId: batch.itemId,
          manufacturedAt: batch.producedAt,
          status: "LIBERADO"
        }
      });
      const unitCost = batch.item.standardCost;
      const totalCost = releaseQuantity.mul(unitCost);

      const updated = await tx.productionBatch.update({
        where: { id: batch.id },
        data: {
          curingQuantity: new Prisma.Decimal(0),
          releasedQuantity: nextReleasedQuantity,
          status: "APTA_RETIRADA",
          readyAt: effectiveReadyAt,
          autoStockedAt: now,
          releasedAt: now,
          releasedById: userId,
          releaseResponsible: responsible,
          releaseNote: `Liberado automaticamente apos ${batch.item.curingHours} hora(s) de cura.`
        }
      });

      await addFinishedGoodsBalance(tx, batch.itemId, finishedWarehouse.id, productionLot.id, releaseQuantity);

      await tx.stockMovement.create({
        data: {
          type: "ENTRADA_PRODUCAO",
          itemId: batch.itemId,
          quantity: releaseQuantity,
          unitCost,
          totalCost,
          targetWarehouseId: finishedWarehouse.id,
          lotId: productionLot.id,
          userId,
          document: batch.code,
          justification: `Entrada automatica por tempo de cura do lote ${batch.code}.`
        }
      });

      await tx.auditLog.create({
        data: {
          userId,
          module: "Producao",
          action: AuditAction.UPDATE,
          entity: "ProductionBatch",
          entityId: batch.id,
          previousValue: {
            status: batch.status,
            curingQuantity: batch.curingQuantity.toString(),
            releasedQuantity: batch.releasedQuantity.toString(),
            readyAt: batch.readyAt?.toISOString() || null
          },
          newValue: {
            status: updated.status,
            releasedQuantity: releaseQuantity.toString(),
            releaseResponsible: responsible,
            readyAt: effectiveReadyAt.toISOString(),
            autoStockedAt: now.toISOString(),
            stockMovement: "ENTRADA_PRODUCAO",
            warehouse: finishedWarehouse.code,
            lot: productionLot.code
          }
        }
      });

      released += 1;
    }

    return { checked: batches.length, released };
  });
}

export function calculateBatchReadyAt(producedAt: Date, curingHours: number) {
  return addHours(producedAt, curingHours);
}
