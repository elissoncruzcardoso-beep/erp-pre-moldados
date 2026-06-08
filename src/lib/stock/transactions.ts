import { Prisma, type StockMovementType, type Warehouse } from "@prisma/client";

type StockTx = Prisma.TransactionClient;

export const positiveStockMovementTypes = new Set<StockMovementType>([
  "ENTRADA_COMPRA",
  "ENTRADA_PRODUCAO",
  "AJUSTE_POSITIVO",
  "ESTORNO"
]);

export const negativeStockMovementTypes = new Set<StockMovementType>([
  "SAIDA_PRODUCAO",
  "AJUSTE_NEGATIVO"
]);

export function toDecimal(value: Prisma.Decimal.Value) {
  return new Prisma.Decimal(value);
}

export async function findStockBalance(
  tx: StockTx,
  itemId: string,
  warehouseId: string,
  lotId: string | null
) {
  return tx.stockBalance.findFirst({
    where: {
      itemId,
      warehouseId,
      lotId
    }
  });
}

export async function increaseStockBalance(
  tx: StockTx,
  itemId: string,
  warehouseId: string,
  quantity: Prisma.Decimal,
  lotId: string | null = null
) {
  const currentBalance = await findStockBalance(tx, itemId, warehouseId, lotId);

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

export async function decreaseStockBalance(
  tx: StockTx,
  itemId: string,
  warehouse: Pick<Warehouse, "id" | "allowsNegative">,
  quantity: Prisma.Decimal,
  lotId: string | null = null
) {
  const currentBalance = await findStockBalance(tx, itemId, warehouse.id, lotId);
  const availableQuantity = currentBalance?.quantity ?? new Prisma.Decimal(0);
  const nextQuantity = availableQuantity.minus(quantity);

  if (!warehouse.allowsNegative && nextQuantity.lessThan(0)) {
    throw new Error("Saldo insuficiente para esta movimentacao.");
  }

  if (currentBalance) {
    return tx.stockBalance.update({
      where: { id: currentBalance.id },
      data: { quantity: nextQuantity }
    });
  }

  return tx.stockBalance.create({
    data: {
      itemId,
      warehouseId: warehouse.id,
      lotId,
      quantity: nextQuantity
    }
  });
}

export async function reserveStockBalance(
  tx: StockTx,
  itemId: string,
  warehouse: Pick<Warehouse, "id" | "allowsNegative">,
  quantity: Prisma.Decimal,
  lotId: string | null = null
) {
  const currentBalance = await findStockBalance(tx, itemId, warehouse.id, lotId);
  const stockQuantity = currentBalance?.quantity ?? new Prisma.Decimal(0);
  const reservedQuantity = currentBalance?.reserved ?? new Prisma.Decimal(0);
  const availableQuantity = stockQuantity.minus(reservedQuantity);

  if (!warehouse.allowsNegative && availableQuantity.minus(quantity).lessThan(0)) {
    throw new Error("Saldo disponivel insuficiente para reservar.");
  }

  if (currentBalance) {
    return tx.stockBalance.update({
      where: { id: currentBalance.id },
      data: { reserved: reservedQuantity.plus(quantity) }
    });
  }

  return tx.stockBalance.create({
    data: {
      itemId,
      warehouseId: warehouse.id,
      lotId,
      reserved: quantity
    }
  });
}

export async function releaseReservedStockBalance(
  tx: StockTx,
  itemId: string,
  warehouseId: string,
  quantity: Prisma.Decimal,
  lotId: string | null = null
) {
  const currentBalance = await findStockBalance(tx, itemId, warehouseId, lotId);

  if (!currentBalance) {
    return null;
  }

  const nextReserved = currentBalance.reserved.minus(quantity);

  return tx.stockBalance.update({
    where: { id: currentBalance.id },
    data: {
      reserved: nextReserved.lessThan(0) ? new Prisma.Decimal(0) : nextReserved
    }
  });
}

type ApplyStockMovementBalanceInput = {
  type: StockMovementType;
  itemId: string;
  quantity: Prisma.Decimal;
  originWarehouse?: Pick<Warehouse, "id" | "allowsNegative"> | null;
  targetWarehouse?: Pick<Warehouse, "id" | "allowsNegative"> | null;
  lotId?: string | null;
};

type ConsumeStockInput = {
  itemId: string;
  warehouse: Pick<Warehouse, "id" | "allowsNegative">;
  quantity: Prisma.Decimal;
};

export type ConsumedStockLot = {
  lotId: string | null;
  lotCode: string;
  quantity: string;
};

export async function consumeStockFromWarehouse(
  tx: StockTx,
  { itemId, warehouse, quantity }: ConsumeStockInput
): Promise<ConsumedStockLot[]> {
  const balances = await tx.stockBalance.findMany({
    where: { itemId, warehouseId: warehouse.id },
    include: { lot: true },
    orderBy: [{ lot: { createdAt: "asc" } }, { updatedAt: "asc" }]
  });
  const availableQuantity = balances.reduce((total, balance) => {
    const available = balance.quantity.minus(balance.reserved);
    return available.greaterThan(0) ? total.plus(available) : total;
  }, new Prisma.Decimal(0));

  if (!warehouse.allowsNegative && availableQuantity.minus(quantity).lessThan(0)) {
    throw new Error(`Saldo insuficiente. Disponivel neste deposito: ${availableQuantity.toString()}.`);
  }

  let remainingQuantity = quantity;
  const consumedLots: ConsumedStockLot[] = [];

  for (const balance of balances) {
    if (remainingQuantity.lessThanOrEqualTo(0)) break;

    const available = balance.quantity.minus(balance.reserved);
    if (available.lessThanOrEqualTo(0)) continue;

    const consumed = available.greaterThanOrEqualTo(remainingQuantity) ? remainingQuantity : available;

    await tx.stockBalance.update({
      where: { id: balance.id },
      data: { quantity: balance.quantity.minus(consumed) }
    });

    consumedLots.push({
      lotId: balance.lotId,
      lotCode: balance.lot?.code || "SEM_LOTE",
      quantity: consumed.toString()
    });
    remainingQuantity = remainingQuantity.minus(consumed);
  }

  if (remainingQuantity.greaterThan(0) && warehouse.allowsNegative) {
    const balanceWithoutLot = balances.find((balance) => !balance.lotId);

    if (balanceWithoutLot) {
      await tx.stockBalance.update({
        where: { id: balanceWithoutLot.id },
        data: { quantity: balanceWithoutLot.quantity.minus(remainingQuantity) }
      });
    } else {
      await tx.stockBalance.create({
        data: {
          itemId,
          warehouseId: warehouse.id,
          quantity: new Prisma.Decimal(0).minus(remainingQuantity)
        }
      });
    }

    consumedLots.push({ lotId: null, lotCode: "SALDO_NEGATIVO", quantity: remainingQuantity.toString() });
  }

  return consumedLots;
}

export async function applyStockMovementBalance(
  tx: StockTx,
  {
    type,
    itemId,
    quantity,
    originWarehouse,
    targetWarehouse,
    lotId = null
  }: ApplyStockMovementBalanceInput
) {
  if (type === "TRANSFERENCIA") {
    if (!originWarehouse || !targetWarehouse) {
      throw new Error("Informe os depositos de origem e destino.");
    }

    await decreaseStockBalance(tx, itemId, originWarehouse, quantity, lotId);
    await increaseStockBalance(tx, itemId, targetWarehouse.id, quantity, lotId);
    return;
  }

  if (type === "RESERVA") {
    if (!originWarehouse) {
      throw new Error("Informe o deposito de origem.");
    }

    await reserveStockBalance(tx, itemId, originWarehouse, quantity, lotId);
    return;
  }

  if (positiveStockMovementTypes.has(type)) {
    if (!targetWarehouse) {
      throw new Error("Informe o deposito de destino.");
    }

    await increaseStockBalance(tx, itemId, targetWarehouse.id, quantity, lotId);
    return;
  }

  if (negativeStockMovementTypes.has(type)) {
    if (!originWarehouse) {
      throw new Error("Informe o deposito de origem.");
    }

    if (!lotId) {
      await consumeStockFromWarehouse(tx, { itemId, warehouse: originWarehouse, quantity });
      return;
    }

    await decreaseStockBalance(tx, itemId, originWarehouse, quantity, lotId);
  }
}

export async function reverseStockMovementBalance(
  tx: StockTx,
  {
    type,
    itemId,
    quantity,
    originWarehouse,
    targetWarehouse,
    lotId = null
  }: ApplyStockMovementBalanceInput
) {
  if (type === "TRANSFERENCIA") {
    if (!originWarehouse || !targetWarehouse) {
      throw new Error("Movimentacao de transferencia sem deposito completo.");
    }

    await decreaseStockBalance(tx, itemId, targetWarehouse, quantity, lotId);
    await increaseStockBalance(tx, itemId, originWarehouse.id, quantity, lotId);
    return;
  }

  if (type === "RESERVA") {
    if (!originWarehouse) {
      throw new Error("Reserva sem deposito de origem.");
    }

    await releaseReservedStockBalance(tx, itemId, originWarehouse.id, quantity, lotId);
    return;
  }

  if (positiveStockMovementTypes.has(type)) {
    if (!targetWarehouse) {
      throw new Error("Movimentacao de entrada sem deposito de destino.");
    }

    await decreaseStockBalance(tx, itemId, targetWarehouse, quantity, lotId);
    return;
  }

  if (negativeStockMovementTypes.has(type)) {
    if (!originWarehouse) {
      throw new Error("Movimentacao de saida sem deposito de origem.");
    }

    await increaseStockBalance(tx, itemId, originWarehouse.id, quantity, lotId);
  }
}
