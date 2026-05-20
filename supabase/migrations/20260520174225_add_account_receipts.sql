CREATE TABLE IF NOT EXISTS "AccountReceipt" (
  "id" TEXT NOT NULL,
  "accountReceivableId" TEXT NOT NULL,
  "receivedById" TEXT NOT NULL,
  "receiptDate" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "amount" DECIMAL(14,4) NOT NULL,
  "method" TEXT NOT NULL,
  "reference" TEXT,
  "note" TEXT,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

  CONSTRAINT "AccountReceipt_pkey" PRIMARY KEY ("id")
);

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint WHERE conname = 'AccountReceipt_accountReceivableId_fkey'
  ) THEN
    ALTER TABLE "AccountReceipt"
      ADD CONSTRAINT "AccountReceipt_accountReceivableId_fkey"
      FOREIGN KEY ("accountReceivableId") REFERENCES "AccountReceivable"("id")
      ON DELETE CASCADE ON UPDATE CASCADE;
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint WHERE conname = 'AccountReceipt_receivedById_fkey'
  ) THEN
    ALTER TABLE "AccountReceipt"
      ADD CONSTRAINT "AccountReceipt_receivedById_fkey"
      FOREIGN KEY ("receivedById") REFERENCES "User"("id")
      ON DELETE RESTRICT ON UPDATE CASCADE;
  END IF;
END $$;

ALTER TABLE "AccountReceipt" ENABLE ROW LEVEL SECURITY;

REVOKE ALL ON TABLE "AccountReceipt" FROM anon;
REVOKE ALL ON TABLE "AccountReceipt" FROM authenticated;
