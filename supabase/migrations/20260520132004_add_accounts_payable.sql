DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_type WHERE typname = 'AccountPayableStatus') THEN
    CREATE TYPE "AccountPayableStatus" AS ENUM (
      'ABERTO',
      'PROGRAMADO',
      'PAGO',
      'CANCELADO'
    );
  END IF;
END $$;

CREATE TABLE IF NOT EXISTS "AccountPayable" (
  "id" TEXT NOT NULL,
  "number" TEXT NOT NULL,
  "purchaseReceiptId" TEXT NOT NULL,
  "supplierId" TEXT NOT NULL,
  "createdById" TEXT NOT NULL,
  "status" "AccountPayableStatus" NOT NULL DEFAULT 'ABERTO',
  "description" TEXT NOT NULL,
  "documentNumber" TEXT,
  "costCenter" TEXT,
  "issueDate" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "dueDate" TIMESTAMP(3) NOT NULL,
  "amount" DECIMAL(14,4) NOT NULL,
  "paidAmount" DECIMAL(14,4) NOT NULL DEFAULT 0,
  "paidAt" TIMESTAMP(3),
  "note" TEXT,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL,

  CONSTRAINT "AccountPayable_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX IF NOT EXISTS "AccountPayable_number_key" ON "AccountPayable"("number");
CREATE UNIQUE INDEX IF NOT EXISTS "AccountPayable_purchaseReceiptId_key" ON "AccountPayable"("purchaseReceiptId");

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint WHERE conname = 'AccountPayable_purchaseReceiptId_fkey'
  ) THEN
    ALTER TABLE "AccountPayable"
      ADD CONSTRAINT "AccountPayable_purchaseReceiptId_fkey"
      FOREIGN KEY ("purchaseReceiptId") REFERENCES "PurchaseReceipt"("id")
      ON DELETE RESTRICT ON UPDATE CASCADE;
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint WHERE conname = 'AccountPayable_supplierId_fkey'
  ) THEN
    ALTER TABLE "AccountPayable"
      ADD CONSTRAINT "AccountPayable_supplierId_fkey"
      FOREIGN KEY ("supplierId") REFERENCES "Supplier"("id")
      ON DELETE RESTRICT ON UPDATE CASCADE;
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint WHERE conname = 'AccountPayable_createdById_fkey'
  ) THEN
    ALTER TABLE "AccountPayable"
      ADD CONSTRAINT "AccountPayable_createdById_fkey"
      FOREIGN KEY ("createdById") REFERENCES "User"("id")
      ON DELETE RESTRICT ON UPDATE CASCADE;
  END IF;
END $$;

ALTER TABLE "AccountPayable" ENABLE ROW LEVEL SECURITY;

REVOKE ALL ON TABLE "AccountPayable" FROM anon;
REVOKE ALL ON TABLE "AccountPayable" FROM authenticated;
