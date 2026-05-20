DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_type WHERE typname = 'PurchaseQuoteStatus') THEN
    CREATE TYPE "PurchaseQuoteStatus" AS ENUM ('RECEBIDA', 'APROVADA', 'REPROVADA', 'CANCELADA');
  END IF;
END $$;

CREATE TABLE IF NOT EXISTS "PurchaseQuote" (
  "id" TEXT NOT NULL,
  "number" TEXT NOT NULL,
  "purchaseRequestId" TEXT NOT NULL,
  "supplierId" TEXT NOT NULL,
  "createdById" TEXT NOT NULL,
  "status" "PurchaseQuoteStatus" NOT NULL DEFAULT 'RECEBIDA',
  "deliveryDays" INTEGER,
  "paymentTerms" TEXT,
  "validUntil" TIMESTAMP(3),
  "freightCost" DECIMAL(14,4) NOT NULL DEFAULT 0,
  "totalValue" DECIMAL(14,4) NOT NULL,
  "note" TEXT,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL,

  CONSTRAINT "PurchaseQuote_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX IF NOT EXISTS "PurchaseQuote_number_key" ON "PurchaseQuote"("number");

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint WHERE conname = 'PurchaseQuote_purchaseRequestId_fkey'
  ) THEN
    ALTER TABLE "PurchaseQuote"
      ADD CONSTRAINT "PurchaseQuote_purchaseRequestId_fkey"
      FOREIGN KEY ("purchaseRequestId") REFERENCES "PurchaseRequest"("id")
      ON DELETE RESTRICT ON UPDATE CASCADE;
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint WHERE conname = 'PurchaseQuote_supplierId_fkey'
  ) THEN
    ALTER TABLE "PurchaseQuote"
      ADD CONSTRAINT "PurchaseQuote_supplierId_fkey"
      FOREIGN KEY ("supplierId") REFERENCES "Supplier"("id")
      ON DELETE RESTRICT ON UPDATE CASCADE;
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint WHERE conname = 'PurchaseQuote_createdById_fkey'
  ) THEN
    ALTER TABLE "PurchaseQuote"
      ADD CONSTRAINT "PurchaseQuote_createdById_fkey"
      FOREIGN KEY ("createdById") REFERENCES "User"("id")
      ON DELETE RESTRICT ON UPDATE CASCADE;
  END IF;
END $$;

ALTER TABLE "PurchaseQuote" ENABLE ROW LEVEL SECURITY;

REVOKE ALL ON TABLE "PurchaseQuote" FROM anon;
REVOKE ALL ON TABLE "PurchaseQuote" FROM authenticated;
