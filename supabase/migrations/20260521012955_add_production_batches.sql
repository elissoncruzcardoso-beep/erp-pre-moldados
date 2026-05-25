DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_type WHERE typname = 'ProductionBatchStatus') THEN
    CREATE TYPE "ProductionBatchStatus" AS ENUM (
      'EM_CURA',
      'APTA_RETIRADA',
      'RETIRADA_PARCIAL',
      'RETIRADA_TOTAL',
      'BLOQUEADA'
    );
  END IF;
END $$;

CREATE TABLE IF NOT EXISTS "ProductionBatch" (
  "id" TEXT NOT NULL,
  "code" TEXT NOT NULL,
  "dailyLogItemId" TEXT NOT NULL,
  "itemId" TEXT NOT NULL,
  "producedQuantity" DECIMAL(14,3) NOT NULL,
  "curingQuantity" DECIMAL(14,3) NOT NULL,
  "releasedQuantity" DECIMAL(14,3) NOT NULL DEFAULT 0,
  "status" "ProductionBatchStatus" NOT NULL DEFAULT 'EM_CURA',
  "producedAt" TIMESTAMP(3) NOT NULL,
  "releasedAt" TIMESTAMP(3),
  "releasedById" TEXT,
  "releaseResponsible" TEXT,
  "releaseNote" TEXT,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL,

  CONSTRAINT "ProductionBatch_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX IF NOT EXISTS "ProductionBatch_code_key" ON "ProductionBatch"("code");
CREATE UNIQUE INDEX IF NOT EXISTS "ProductionBatch_dailyLogItemId_key" ON "ProductionBatch"("dailyLogItemId");

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint WHERE conname = 'ProductionBatch_dailyLogItemId_fkey'
  ) THEN
    ALTER TABLE "ProductionBatch"
      ADD CONSTRAINT "ProductionBatch_dailyLogItemId_fkey"
      FOREIGN KEY ("dailyLogItemId") REFERENCES "ProductionDailyLogItem"("id")
      ON DELETE CASCADE ON UPDATE CASCADE;
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint WHERE conname = 'ProductionBatch_itemId_fkey'
  ) THEN
    ALTER TABLE "ProductionBatch"
      ADD CONSTRAINT "ProductionBatch_itemId_fkey"
      FOREIGN KEY ("itemId") REFERENCES "Item"("id")
      ON DELETE RESTRICT ON UPDATE CASCADE;
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint WHERE conname = 'ProductionBatch_releasedById_fkey'
  ) THEN
    ALTER TABLE "ProductionBatch"
      ADD CONSTRAINT "ProductionBatch_releasedById_fkey"
      FOREIGN KEY ("releasedById") REFERENCES "User"("id")
      ON DELETE SET NULL ON UPDATE CASCADE;
  END IF;
END $$;

ALTER TABLE "ProductionBatch" ENABLE ROW LEVEL SECURITY;

REVOKE ALL ON TABLE "ProductionBatch" FROM anon;
REVOKE ALL ON TABLE "ProductionBatch" FROM authenticated;
