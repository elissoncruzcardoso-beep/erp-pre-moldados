import { Prisma } from "@prisma/client";

type CompositionWithItems = {
  id: string;
  code: string;
  baseQuantity: Prisma.Decimal;
  expectedLoss: Prisma.Decimal;
  items: {
    itemId: string;
    quantity: Prisma.Decimal;
    lossPercent: Prisma.Decimal;
    item: {
      code: string;
      description: string;
      standardCost: Prisma.Decimal;
    };
  }[];
};

type ConsumptionEntry = {
  itemId: string;
  itemCode: string;
  itemDescription: string;
  requiredQuantity: Prisma.Decimal;
  unitCost: Prisma.Decimal;
  totalCost: Prisma.Decimal;
};

export type ProductionConsumptionSummary = {
  compositionCode: string;
  consumedItems: {
    itemCode: string;
    itemDescription: string;
    quantity: string;
    totalCost: string;
  }[];
};

function calculateRequiredQuantity(
  producedQuantity: Prisma.Decimal,
  composition: CompositionWithItems,
  itemQuantity: Prisma.Decimal,
  itemLossPercent: Prisma.Decimal
) {
  const baseQuantity = composition.baseQuantity.equals(0)
    ? new Prisma.Decimal(1)
    : composition.baseQuantity;
  const compositionLossFactor = new Prisma.Decimal(1).plus(composition.expectedLoss.div(100));
  const itemLossFactor = new Prisma.Decimal(1).plus(itemLossPercent.div(100));

  return producedQuantity.div(baseQuantity).mul(itemQuantity).mul(compositionLossFactor).mul(itemLossFactor);
}

async function subtractAcrossAvailableBalances(
  tx: Prisma.TransactionClient,
  itemId: string,
  warehouseId: string,
  requiredQuantity: Prisma.Decimal,
  itemLabel: string
) {
  const balances = await tx.stockBalance.findMany({
    where: {
      itemId,
      warehouseId,
      quantity: { gt: 0 }
    },
    orderBy: [{ lotId: "asc" }, { updatedAt: "asc" }]
  });

  const availableQuantity = balances.reduce(
    (total, balance) => total.plus(balance.quantity),
    new Prisma.Decimal(0)
  );

  if (availableQuantity.lessThan(requiredQuantity)) {
    throw new Error(
      `Saldo insuficiente para produzir. Falta ${itemLabel}: necessario ${requiredQuantity.toFixed(3)}, disponivel ${availableQuantity.toFixed(3)}.`
    );
  }

  let remaining = requiredQuantity;
  const consumedLots: { lotId: string | null; quantity: Prisma.Decimal }[] = [];

  for (const balance of balances) {
    if (remaining.lessThanOrEqualTo(0)) {
      break;
    }

    const consumedQuantity = Prisma.Decimal.min(balance.quantity, remaining);
    const nextQuantity = balance.quantity.minus(consumedQuantity);

    await tx.stockBalance.update({
      where: { id: balance.id },
      data: { quantity: nextQuantity }
    });

    consumedLots.push({
      lotId: balance.lotId,
      quantity: consumedQuantity
    });
    remaining = remaining.minus(consumedQuantity);
  }

  return consumedLots;
}

export async function consumeApprovedCompositionForProduction(
  tx: Prisma.TransactionClient,
  input: {
    productId: string;
    producedQuantity: Prisma.Decimal;
    userId: string;
    document: string;
    justification: string;
    productionOrderId?: string | null;
  }
): Promise<ProductionConsumptionSummary | null> {
  const composition = await tx.composition.findFirst({
    where: {
      productId: input.productId,
      approved: true
    },
    include: {
      items: {
        include: {
          item: true
        }
      }
    },
    orderBy: [{ updatedAt: "desc" }, { code: "asc" }]
  });

  if (!composition || composition.items.length === 0) {
    return null;
  }

  const rawMaterialWarehouse = await tx.warehouse.findUnique({ where: { code: "MP" } });

  if (!rawMaterialWarehouse || !rawMaterialWarehouse.active) {
    throw new Error("Deposito de materia-prima MP nao encontrado ou inativo.");
  }

  const entries: ConsumptionEntry[] = composition.items.map((compositionItem) => {
    const requiredQuantity = calculateRequiredQuantity(
      input.producedQuantity,
      composition,
      compositionItem.quantity,
      compositionItem.lossPercent
    );
    const unitCost = compositionItem.item.standardCost;

    return {
      itemId: compositionItem.itemId,
      itemCode: compositionItem.item.code,
      itemDescription: compositionItem.item.description,
      requiredQuantity,
      unitCost,
      totalCost: requiredQuantity.mul(unitCost)
    };
  });

  for (const entry of entries) {
    const consumedLots = await subtractAcrossAvailableBalances(
      tx,
      entry.itemId,
      rawMaterialWarehouse.id,
      entry.requiredQuantity,
      `${entry.itemCode} - ${entry.itemDescription}`
    );

    for (const consumedLot of consumedLots) {
      await tx.stockMovement.create({
        data: {
          type: "SAIDA_PRODUCAO",
          itemId: entry.itemId,
          quantity: consumedLot.quantity,
          unitCost: entry.unitCost,
          totalCost: consumedLot.quantity.mul(entry.unitCost),
          originWarehouseId: rawMaterialWarehouse.id,
          lotId: consumedLot.lotId,
          productionOrderId: input.productionOrderId || null,
          userId: input.userId,
          document: input.document,
          justification: input.justification
        }
      });
    }
  }

  return {
    compositionCode: composition.code,
    consumedItems: entries.map((entry) => ({
      itemCode: entry.itemCode,
      itemDescription: entry.itemDescription,
      quantity: entry.requiredQuantity.toFixed(3),
      totalCost: entry.totalCost.toFixed(4)
    }))
  };
}
