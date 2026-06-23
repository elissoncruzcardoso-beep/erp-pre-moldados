import test from "node:test";
import assert from "node:assert/strict";
import { Prisma } from "@prisma/client";
import { consumeApprovedCompositionForProduction } from "../src/lib/production/consume-composition";

function makeConsumptionTx({ updateCount = 1 } = {}) {
  const updateManyCalls: unknown[] = [];
  const movements: unknown[] = [];
  const tx = {
    composition: {
      findFirst: async () => ({
        id: "composition-1",
        code: "COMP-001",
        baseQuantity: new Prisma.Decimal(1),
        expectedLoss: new Prisma.Decimal(0),
        items: [
          {
            itemId: "material-1",
            quantity: new Prisma.Decimal(2),
            lossPercent: new Prisma.Decimal(0),
            item: {
              code: "MP-001",
              description: "Cimento",
              standardCost: new Prisma.Decimal(10)
            }
          }
        ]
      })
    },
    warehouse: {
      findUnique: async () => ({
        id: "warehouse-mp",
        code: "MP",
        active: true
      })
    },
    stockBalance: {
      findMany: async () => [
        {
          id: "balance-1",
          itemId: "material-1",
          warehouseId: "warehouse-mp",
          lotId: null,
          quantity: new Prisma.Decimal(10),
          reserved: new Prisma.Decimal(3)
        }
      ],
      updateMany: async (args: unknown) => {
        updateManyCalls.push(args);
        return { count: updateCount };
      }
    },
    stockMovement: {
      create: async (args: unknown) => {
        movements.push(args);
        return args;
      }
    }
  };

  return { tx, updateManyCalls, movements };
}

test("consumeApprovedCompositionForProduction uses reserved-aware atomic decrement", async () => {
  const { tx, updateManyCalls, movements } = makeConsumptionTx();

  const summary = await consumeApprovedCompositionForProduction(tx as never, {
    productId: "product-1",
    producedQuantity: new Prisma.Decimal(2),
    userId: "user-1",
    document: "LOTE-001",
    justification: "Teste"
  });

  assert.equal(summary?.compositionCode, "COMP-001");
  assert.equal(updateManyCalls.length, 1);
  assert.equal(movements.length, 1);

  const updateArgs = updateManyCalls[0] as {
    where: { id: string; quantity: { gte: Prisma.Decimal } };
    data: { quantity: { decrement: Prisma.Decimal } };
  };

  assert.equal(updateArgs.where.id, "balance-1");
  assert.equal(updateArgs.where.quantity.gte.toString(), "7");
  assert.equal(updateArgs.data.quantity.decrement.toString(), "4");
});

test("consumeApprovedCompositionForProduction fails on concurrent stock change", async () => {
  const { tx } = makeConsumptionTx({ updateCount: 0 });

  await assert.rejects(
    () =>
      consumeApprovedCompositionForProduction(tx as never, {
        productId: "product-1",
        producedQuantity: new Prisma.Decimal(2),
        userId: "user-1",
        document: "LOTE-001",
        justification: "Teste"
      }),
    /Saldo alterado por outra operacao/
  );
});
