import test from "node:test";
import assert from "node:assert/strict";
import { Prisma } from "@prisma/client";
import { cancelDirectSale, createDirectSale } from "../src/lib/sales/direct-sale-service";
import type { StockSaleInput } from "../src/lib/validations/sales";

type FakeState = ReturnType<typeof createInitialState>;
type StockBalanceRecord = {
  id: string;
  itemId: string;
  warehouseId: string;
  lotId: string | null;
  quantity: Prisma.Decimal;
  reserved: Prisma.Decimal;
  updatedAt: Date;
  lot: { id: string; code: string; createdAt: Date } | null;
};

function decimal(value: Prisma.Decimal.Value) {
  return new Prisma.Decimal(value);
}

function cloneJson<T>(value: T): T {
  return JSON.parse(JSON.stringify(value));
}

function cloneState(state: FakeState): FakeState {
  const cloned = cloneJson(state);

  cloned.stockBalances = cloned.stockBalances.map((balance) => ({
    ...balance,
    quantity: decimal(balance.quantity),
    reserved: decimal(balance.reserved),
    updatedAt: new Date(balance.updatedAt),
    lot: balance.lot ? { ...balance.lot, createdAt: new Date(balance.lot.createdAt) } : null
  }));
  cloned.directSales = cloned.directSales.map((sale) => ({
    ...sale,
    issuedAt: new Date(sale.issuedAt),
    cancelledAt: sale.cancelledAt ? new Date(sale.cancelledAt) : null,
    quantity: decimal(sale.quantity),
    unitPrice: decimal(sale.unitPrice),
    grossTotal: decimal(sale.grossTotal),
    discount: decimal(sale.discount),
    finalTotal: decimal(sale.finalTotal)
  }));
  cloned.accountsReceivable = cloned.accountsReceivable.map((receivable) => ({
    ...receivable,
    issueDate: new Date(receivable.issueDate),
    dueDate: new Date(receivable.dueDate),
    receivedAt: receivable.receivedAt ? new Date(receivable.receivedAt) : null,
    amount: decimal(receivable.amount),
    receivedAmount: decimal(receivable.receivedAmount)
  }));

  return cloned;
}

function createInitialState() {
  const stockBalances: StockBalanceRecord[] = [
    {
      id: "balance-1",
      itemId: "item-1",
      warehouseId: "warehouse-1",
      lotId: "lot-1",
      quantity: decimal(5),
      reserved: decimal(0),
      updatedAt: new Date("2026-07-03T08:00:00.000Z"),
      lot: {
        id: "lot-1",
        code: "LOTE-001",
        createdAt: new Date("2026-07-01T08:00:00.000Z")
      }
    },
    {
      id: "balance-2",
      itemId: "item-2",
      warehouseId: "warehouse-1",
      lotId: "lot-2",
      quantity: decimal(1),
      reserved: decimal(0),
      updatedAt: new Date("2026-07-03T08:00:00.000Z"),
      lot: {
        id: "lot-2",
        code: "LOTE-002",
        createdAt: new Date("2026-07-02T08:00:00.000Z")
      }
    }
  ];

  return {
    counters: {
      movement: 0,
      sale: 0,
      receivable: 0,
      receipt: 0,
      audit: 0,
      balance: 0
    },
    items: [
      {
        id: "item-1",
        code: "PM-D80",
        description: "MANILHA PRE-MOLDADA D=80 X ALT=50 CM",
        active: true,
        controlsStock: true,
        unit: { code: "UN" }
      },
      {
        id: "item-2",
        code: "TP-D80",
        description: "TAMPA PRE-MOLDADA D=80 X ESP=5 CM",
        active: true,
        controlsStock: true,
        unit: { code: "UN" }
      }
    ],
    warehouses: [
      {
        id: "warehouse-1",
        code: "PA",
        name: "Produto acabado",
        active: true,
        allowsNegative: false
      }
    ],
    customers: [
      {
        id: "customer-1",
        name: "Construtora Vale",
        document: "00.000.000/0001-11",
        active: true
      }
    ],
    stockBalances,
    stockMovements: [] as Array<Record<string, unknown>>,
    directSales: [] as Array<Record<string, any>>,
    accountsReceivable: [] as Array<Record<string, any>>,
    accountReceipts: [] as Array<Record<string, any>>,
    auditLogs: [] as Array<Record<string, unknown>>
  };
}

function createFakePrisma(initialState = createInitialState()) {
  let state = initialState;

  const tx = {
    item: {
      findMany: async ({ where }: { where: { id: { in: string[] } } }) =>
        state.items.filter((item) => where.id.in.includes(item.id))
    },
    warehouse: {
      findMany: async ({ where }: { where: { id: { in: string[] } } }) =>
        state.warehouses.filter((warehouse) => where.id.in.includes(warehouse.id))
    },
    customer: {
      findUnique: async ({ where }: { where: { id: string } }) =>
        state.customers.find((customer) => customer.id === where.id) ?? null
    },
    stockBalance: {
      findMany: async ({ where }: { where: { itemId: string; warehouseId: string } }) =>
        state.stockBalances.filter((balance) => balance.itemId === where.itemId && balance.warehouseId === where.warehouseId),
      findFirst: async ({ where }: { where: { itemId: string; warehouseId: string; lotId?: string | null } }) =>
        state.stockBalances.find(
          (balance) =>
            balance.itemId === where.itemId &&
            balance.warehouseId === where.warehouseId &&
            (where.lotId === undefined || balance.lotId === where.lotId)
        ) ?? null,
      updateMany: async ({ where, data }: { where: { id?: string; quantity?: { gte: Prisma.Decimal } }; data: { quantity: { decrement?: Prisma.Decimal; increment?: Prisma.Decimal } } }) => {
        const balance = state.stockBalances.find((item) => item.id === where.id);

        if (!balance) return { count: 0 };
        if (where.quantity?.gte && balance.quantity.lessThan(where.quantity.gte)) return { count: 0 };

        if (data.quantity.decrement) balance.quantity = balance.quantity.minus(data.quantity.decrement);
        if (data.quantity.increment) balance.quantity = balance.quantity.plus(data.quantity.increment);

        return { count: 1 };
      },
      update: async ({ where, data }: { where: { id: string }; data: { quantity: { decrement?: Prisma.Decimal; increment?: Prisma.Decimal } | Prisma.Decimal } }) => {
        const balance = state.stockBalances.find((item) => item.id === where.id);

        if (!balance) throw new Error("Saldo nao encontrado.");
        if (data.quantity instanceof Prisma.Decimal) balance.quantity = data.quantity;
        if (!(data.quantity instanceof Prisma.Decimal) && data.quantity.decrement) balance.quantity = balance.quantity.minus(data.quantity.decrement);
        if (!(data.quantity instanceof Prisma.Decimal) && data.quantity.increment) balance.quantity = balance.quantity.plus(data.quantity.increment);

        return balance;
      },
      create: async ({ data }: { data: Record<string, any> }) => {
        const balance = {
          id: `balance-${++state.counters.balance + 2}`,
          itemId: data.itemId,
          warehouseId: data.warehouseId,
          lotId: data.lotId ?? null,
          quantity: decimal(data.quantity ?? 0),
          reserved: decimal(data.reserved ?? 0),
          updatedAt: new Date(),
          lot: null
        };
        state.stockBalances.push(balance);
        return balance;
      }
    },
    stockMovement: {
      create: async ({ data }: { data: Record<string, unknown> }) => {
        const movement = { id: `movement-${++state.counters.movement}`, ...data };
        state.stockMovements.push(movement);
        return movement;
      }
    },
    auditLog: {
      create: async ({ data }: { data: Record<string, unknown> }) => {
        const log = { id: `audit-${++state.counters.audit}`, ...data };
        state.auditLogs.push(log);
        return log;
      }
    },
    directSale: {
      create: async ({ data }: { data: Record<string, any> }) => {
        const item = state.items.find((record) => record.id === data.itemId)!;
        const warehouse = state.warehouses.find((record) => record.id === data.warehouseId)!;
        const sale = {
          id: `sale-${++state.counters.sale}`,
          status: "ATIVA",
          issuedAt: new Date("2026-07-03T09:00:00.000Z"),
          cancelledAt: null,
          cancelledById: null,
          cancelReason: null,
          ...data,
          createdBy: { name: "Administrador ERP" },
          item,
          warehouse
        };
        state.directSales.push(sale);
        return sale;
      },
      findUnique: async ({ where }: { where: { id: string } }) => {
        const sale = state.directSales.find((record) => record.id === where.id);
        if (!sale) return null;

        return {
          ...sale,
          accountsReceivable: state.accountsReceivable
            .filter((receivable) => receivable.directSaleId === sale.id)
            .map((receivable) => ({
              ...receivable,
              receipts: state.accountReceipts.filter((receipt) => receipt.accountReceivableId === receivable.id)
            }))
        };
      },
      update: async ({ where, data }: { where: { id: string }; data: Record<string, unknown> }) => {
        const sale = state.directSales.find((record) => record.id === where.id);
        if (!sale) throw new Error("Venda nao encontrada.");

        Object.assign(sale, data);
        return sale;
      }
    },
    accountReceivable: {
      create: async ({ data }: { data: Record<string, any> }) => {
        const receivable = { id: `receivable-${++state.counters.receivable}`, ...data };
        state.accountsReceivable.push(receivable);
        return receivable;
      },
      update: async ({ where, data }: { where: { id: string }; data: Record<string, unknown> }) => {
        const receivable = state.accountsReceivable.find((record) => record.id === where.id);
        if (!receivable) throw new Error("Conta a receber nao encontrada.");

        Object.assign(receivable, data);
        return receivable;
      }
    },
    accountReceipt: {
      create: async ({ data }: { data: Record<string, any> }) => {
        const receipt = { id: `receipt-${++state.counters.receipt}`, ...data };
        state.accountReceipts.push(receipt);
        return receipt;
      }
    }
  };

  return {
    get state() {
      return state;
    },
    async $transaction(callback: (transaction: typeof tx) => Promise<unknown>) {
      const before = cloneState(state);
      try {
        return await callback(tx);
      } catch (error) {
        state = before;
        throw error;
      }
    }
  };
}

const validSale: StockSaleInput = {
  customerId: "customer-1",
  customerName: "Construtora Vale",
  customerDocument: "00.000.000/0001-11",
  itemId: "item-1",
  warehouseId: "warehouse-1",
  quantity: 2,
  unitPrice: 100,
  discount: 0,
  paymentMethod: "PIX",
  settleNow: true,
  note: "Venda E2E",
  items: [
    {
      itemId: "item-1",
      warehouseId: "warehouse-1",
      quantity: 2,
      unitPrice: 100,
      discount: 0
    }
  ]
};

test("direct sale flow decrements stock, creates receivable, settles payment and cancels with reversal", async () => {
  const prisma = createFakePrisma();

  const sale = await createDirectSale(prisma as never, validSale, { userId: "user-1" });

  assert.equal(prisma.state.directSales.length, 1);
  assert.equal(prisma.state.stockBalances.find((balance) => balance.id === "balance-1")?.quantity.toString(), "3");
  assert.equal(prisma.state.stockMovements[0].type, "AJUSTE_NEGATIVO");
  assert.equal(prisma.state.accountsReceivable.length, 1);
  assert.equal(prisma.state.accountsReceivable[0].status, "RECEBIDO");
  assert.equal(prisma.state.accountsReceivable[0].receivedAmount.toString(), "200");
  assert.equal(prisma.state.accountReceipts.length, 1);

  await cancelDirectSale(prisma as never, sale.id, { userId: "user-1" }, "Teste de cancelamento");

  assert.equal(prisma.state.directSales[0].status, "CANCELADA");
  assert.equal(prisma.state.stockBalances.find((balance) => balance.id === "balance-1")?.quantity.toString(), "5");
  assert.equal(prisma.state.stockMovements.at(-1)?.type, "ESTORNO");
  assert.equal(prisma.state.accountsReceivable[0].status, "CANCELADO");
  assert.equal(prisma.state.accountsReceivable[0].receivedAmount.toString(), "0");
  assert.ok(prisma.state.auditLogs.some((log) => log.action === "CANCEL" && log.entity === "DirectSale"));
});

test("direct sale flow rolls back stock and financial records when a later item has insufficient stock", async () => {
  const prisma = createFakePrisma();
  const saleWithSecondInsufficientItem: StockSaleInput = {
    ...validSale,
    items: [
      {
        itemId: "item-1",
        warehouseId: "warehouse-1",
        quantity: 2,
        unitPrice: 100,
        discount: 0
      },
      {
        itemId: "item-2",
        warehouseId: "warehouse-1",
        quantity: 2,
        unitPrice: 50,
        discount: 0
      }
    ]
  };

  await assert.rejects(
    () => createDirectSale(prisma as never, saleWithSecondInsufficientItem, { userId: "user-1" }),
    /Saldo insuficiente/
  );

  assert.equal(prisma.state.stockBalances.find((balance) => balance.id === "balance-1")?.quantity.toString(), "5");
  assert.equal(prisma.state.stockBalances.find((balance) => balance.id === "balance-2")?.quantity.toString(), "1");
  assert.equal(prisma.state.directSales.length, 0);
  assert.equal(prisma.state.stockMovements.length, 0);
  assert.equal(prisma.state.accountsReceivable.length, 0);
  assert.equal(prisma.state.accountReceipts.length, 0);
});
