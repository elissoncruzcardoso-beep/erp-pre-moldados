import test from "node:test";
import assert from "node:assert/strict";
import { Prisma } from "@prisma/client";
import { decreaseStockBalance } from "../src/lib/stock/transactions";

function makeStockTx({ updateCount = 1 } = {}) {
  const updateManyCalls: unknown[] = [];
  const tx = {
    stockBalance: {
      findFirst: async () => ({
        id: "balance-1",
        itemId: "item-1",
        warehouseId: "warehouse-1",
        lotId: null,
        quantity: new Prisma.Decimal(5),
        reserved: new Prisma.Decimal(0)
      }),
      updateMany: async (args: unknown) => {
        updateManyCalls.push(args);
        return { count: updateCount };
      },
      update: async () => {
        throw new Error("update should not be used for non-negative stock decrement");
      },
      create: async () => {
        throw new Error("create should not be used when balance exists");
      }
    }
  };

  return { tx, updateManyCalls };
}

test("decreaseStockBalance uses conditional atomic decrement for non-negative warehouse", async () => {
  const { tx, updateManyCalls } = makeStockTx();

  await decreaseStockBalance(
    tx as never,
    "item-1",
    { id: "warehouse-1", allowsNegative: false },
    new Prisma.Decimal(3)
  );

  assert.equal(updateManyCalls.length, 1);
  const updateArgs = updateManyCalls[0] as {
    where: { id: string; quantity: { gte: Prisma.Decimal } };
    data: { quantity: { decrement: Prisma.Decimal } };
  };

  assert.equal(updateArgs.where.id, "balance-1");
  assert.equal(updateArgs.where.quantity.gte.toString(), "3");
  assert.equal(updateArgs.data.quantity.decrement.toString(), "3");
});

test("decreaseStockBalance fails when concurrent operation consumes the balance first", async () => {
  const { tx } = makeStockTx({ updateCount: 0 });

  await assert.rejects(
    () =>
      decreaseStockBalance(
        tx as never,
        "item-1",
        { id: "warehouse-1", allowsNegative: false },
        new Prisma.Decimal(3)
      ),
    /Saldo insuficiente/
  );
});
