DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_type WHERE typname = 'AccountReceivableStatus') THEN
    CREATE TYPE "AccountReceivableStatus" AS ENUM (
      'ABERTO',
      'FATURADO',
      'RECEBIDO',
      'CANCELADO'
    );
  END IF;
END $$;

CREATE TABLE IF NOT EXISTS "AccountReceivable" (
  "id" TEXT NOT NULL,
  "number" TEXT NOT NULL,
  "customerId" TEXT NOT NULL,
  "createdById" TEXT NOT NULL,
  "status" "AccountReceivableStatus" NOT NULL DEFAULT 'ABERTO',
  "description" TEXT NOT NULL,
  "documentNumber" TEXT,
  "costCenter" TEXT,
  "issueDate" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "dueDate" TIMESTAMP(3) NOT NULL,
  "amount" DECIMAL(14,4) NOT NULL,
  "receivedAmount" DECIMAL(14,4) NOT NULL DEFAULT 0,
  "receivedAt" TIMESTAMP(3),
  "note" TEXT,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL,

  CONSTRAINT "AccountReceivable_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX IF NOT EXISTS "AccountReceivable_number_key" ON "AccountReceivable"("number");

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint WHERE conname = 'AccountReceivable_customerId_fkey'
  ) THEN
    ALTER TABLE "AccountReceivable"
      ADD CONSTRAINT "AccountReceivable_customerId_fkey"
      FOREIGN KEY ("customerId") REFERENCES "Customer"("id")
      ON DELETE RESTRICT ON UPDATE CASCADE;
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint WHERE conname = 'AccountReceivable_createdById_fkey'
  ) THEN
    ALTER TABLE "AccountReceivable"
      ADD CONSTRAINT "AccountReceivable_createdById_fkey"
      FOREIGN KEY ("createdById") REFERENCES "User"("id")
      ON DELETE RESTRICT ON UPDATE CASCADE;
  END IF;
END $$;

ALTER TABLE "AccountReceivable" ENABLE ROW LEVEL SECURITY;

REVOKE ALL ON TABLE "AccountReceivable" FROM anon;
REVOKE ALL ON TABLE "AccountReceivable" FROM authenticated;
