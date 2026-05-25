CREATE TABLE IF NOT EXISTS "PurchaseQuoteItem" (
  "id" TEXT NOT NULL,
  "purchaseQuoteId" TEXT NOT NULL,
  "purchaseRequestItemId" TEXT NOT NULL,
  "itemId" TEXT NOT NULL,
  "supplierId" TEXT NOT NULL,
  "quantity" DECIMAL(14,3) NOT NULL,
  "unitPrice" DECIMAL(14,4) NOT NULL DEFAULT 0,
  "discountValue" DECIMAL(14,4) NOT NULL DEFAULT 0,
  "freightCost" DECIMAL(14,4) NOT NULL DEFAULT 0,
  "totalValue" DECIMAL(14,4) NOT NULL DEFAULT 0,
  "note" TEXT,

  CONSTRAINT "PurchaseQuoteItem_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX IF NOT EXISTS "PurchaseQuoteItem_purchaseQuoteId_purchaseRequestItemId_key"
  ON "PurchaseQuoteItem"("purchaseQuoteId", "purchaseRequestItemId");

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint WHERE conname = 'PurchaseQuoteItem_purchaseQuoteId_fkey'
  ) THEN
    ALTER TABLE "PurchaseQuoteItem"
      ADD CONSTRAINT "PurchaseQuoteItem_purchaseQuoteId_fkey"
      FOREIGN KEY ("purchaseQuoteId") REFERENCES "PurchaseQuote"("id")
      ON DELETE CASCADE ON UPDATE CASCADE;
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint WHERE conname = 'PurchaseQuoteItem_purchaseRequestItemId_fkey'
  ) THEN
    ALTER TABLE "PurchaseQuoteItem"
      ADD CONSTRAINT "PurchaseQuoteItem_purchaseRequestItemId_fkey"
      FOREIGN KEY ("purchaseRequestItemId") REFERENCES "PurchaseRequestItem"("id")
      ON DELETE RESTRICT ON UPDATE CASCADE;
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint WHERE conname = 'PurchaseQuoteItem_itemId_fkey'
  ) THEN
    ALTER TABLE "PurchaseQuoteItem"
      ADD CONSTRAINT "PurchaseQuoteItem_itemId_fkey"
      FOREIGN KEY ("itemId") REFERENCES "Item"("id")
      ON DELETE RESTRICT ON UPDATE CASCADE;
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint WHERE conname = 'PurchaseQuoteItem_supplierId_fkey'
  ) THEN
    ALTER TABLE "PurchaseQuoteItem"
      ADD CONSTRAINT "PurchaseQuoteItem_supplierId_fkey"
      FOREIGN KEY ("supplierId") REFERENCES "Supplier"("id")
      ON DELETE RESTRICT ON UPDATE CASCADE;
  END IF;
END $$;

ALTER TABLE "PurchaseQuoteItem" ENABLE ROW LEVEL SECURITY;

REVOKE ALL ON TABLE "PurchaseQuoteItem" FROM anon;
REVOKE ALL ON TABLE "PurchaseQuoteItem" FROM authenticated;
