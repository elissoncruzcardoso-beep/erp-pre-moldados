export type SaleLineSnapshot = {
  itemId: string;
  itemCode: string;
  description: string;
  unitCode: string;
  warehouseId: string;
  warehouse: string;
  quantity: string;
  unitPrice: string;
  grossTotal: string;
  discount: string;
  finalTotal: string;
  movementId: string;
  consumedLots: Array<{ lotId: string | null; lotCode: string; quantity: string }>;
};

export function parseSaleLines(value: unknown): SaleLineSnapshot[] {
  if (!value || typeof value !== "object" || Array.isArray(value)) return [];

  const saleItems = (value as Record<string, unknown>).saleItems;
  if (!Array.isArray(saleItems)) return [];

  return saleItems
    .map((line) => {
      if (!line || typeof line !== "object") return null;
      const record = line as Record<string, unknown>;
      return {
        itemId: String(record.itemId || ""),
        itemCode: String(record.itemCode || ""),
        description: String(record.description || ""),
        unitCode: String(record.unitCode || "UN"),
        warehouseId: String(record.warehouseId || ""),
        warehouse: String(record.warehouse || ""),
        quantity: String(record.quantity || "0"),
        unitPrice: String(record.unitPrice || "0"),
        grossTotal: String(record.grossTotal || "0"),
        discount: String(record.discount || "0"),
        finalTotal: String(record.finalTotal || "0"),
        movementId: String(record.movementId || ""),
        consumedLots: parseConsumedLots(record.consumedLots)
      };
    })
    .filter((line): line is SaleLineSnapshot => Boolean(line));
}

function parseConsumedLots(value: unknown) {
  if (!Array.isArray(value)) return [];

  return value
    .map((lot) => {
      if (!lot || typeof lot !== "object") return null;
      const record = lot as Record<string, unknown>;
      return {
        lotId: record.lotId ? String(record.lotId) : null,
        lotCode: String(record.lotCode || "SEM_LOTE"),
        quantity: String(record.quantity || "0")
      };
    })
    .filter((lot): lot is { lotId: string | null; lotCode: string; quantity: string } => Boolean(lot));
}
