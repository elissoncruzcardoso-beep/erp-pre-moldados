CREATE TABLE IF NOT EXISTS "AccountPayment" (
  "id" TEXT NOT NULL,
  "accountPayableId" TEXT NOT NULL,
  "paidById" TEXT NOT NULL,
  "paymentDate" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "amount" DECIMAL(14,4) NOT NULL,
  "method" TEXT NOT NULL,
  "reference" TEXT,
  "note" TEXT,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

  CONSTRAINT "AccountPayment_pkey" PRIMARY KEY ("id")
);

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint WHERE conname = 'AccountPayment_accountPayableId_fkey'
  ) THEN
    ALTER TABLE "AccountPayment"
      ADD CONSTRAINT "AccountPayment_accountPayableId_fkey"
      FOREIGN KEY ("accountPayableId") REFERENCES "AccountPayable"("id")
      ON DELETE CASCADE ON UPDATE CASCADE;
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint WHERE conname = 'AccountPayment_paidById_fkey'
  ) THEN
    ALTER TABLE "AccountPayment"
      ADD CONSTRAINT "AccountPayment_paidById_fkey"
      FOREIGN KEY ("paidById") REFERENCES "User"("id")
      ON DELETE RESTRICT ON UPDATE CASCADE;
  END IF;
END $$;

ALTER TABLE "AccountPayment" ENABLE ROW LEVEL SECURITY;

REVOKE ALL ON TABLE "AccountPayment" FROM anon;
REVOKE ALL ON TABLE "AccountPayment" FROM authenticated;
