import test from "node:test";
import assert from "node:assert/strict";
import { calculateDirectSaleTotals, buildDirectSaleLines } from "../src/lib/sales/direct-sale-service";
import type { StockSaleInput } from "../src/lib/validations/sales";

const multiItemSale: StockSaleInput = {
  customerId: "customer-1",
  customerName: "Construtora Vale",
  customerDocument: "00.000.000/0001-11",
  itemId: "fallback-item",
  warehouseId: "fallback-warehouse",
  quantity: 1,
  unitPrice: 1,
  discount: 0,
  paymentMethod: "PIX",
  settleNow: true,
  note: "Venda teste",
  items: [
    {
      itemId: "item-1",
      warehouseId: "warehouse-1",
      quantity: 2,
      unitPrice: 100,
      discount: 10
    },
    {
      itemId: "item-2",
      warehouseId: "warehouse-1",
      quantity: 3,
      unitPrice: 50,
      discount: 5
    }
  ]
};

test("buildDirectSaleLines prefers multi-item sale lines over legacy single item fields", () => {
  const lines = buildDirectSaleLines(multiItemSale);

  assert.equal(lines.length, 2);
  assert.equal(lines[0].itemId, "item-1");
  assert.equal(lines[1].itemId, "item-2");
});

test("calculateDirectSaleTotals sums gross, discounts and final total for multi-item sale", () => {
  const totals = calculateDirectSaleTotals(multiItemSale);

  assert.equal(totals.grossTotal.toString(), "350");
  assert.equal(totals.discount.toString(), "15");
  assert.equal(totals.finalTotal.toString(), "335");
});
