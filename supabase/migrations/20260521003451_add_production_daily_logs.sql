CREATE TABLE IF NOT EXISTS "ProductionDailyLog" (
  "id" TEXT NOT NULL,
  "logDate" TIMESTAMP(3) NOT NULL,
  "teamPresent" TEXT NOT NULL,
  "weatherMorning" TEXT NOT NULL,
  "weatherAfternoon" TEXT NOT NULL,
  "observation" TEXT,
  "createdById" TEXT NOT NULL,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL,

  CONSTRAINT "ProductionDailyLog_pkey" PRIMARY KEY ("id")
);

CREATE TABLE IF NOT EXISTS "ProductionDailyLogItem" (
  "id" TEXT NOT NULL,
  "dailyLogId" TEXT NOT NULL,
  "itemId" TEXT NOT NULL,
  "quantity" DECIMAL(14,3) NOT NULL,
  "note" TEXT,

  CONSTRAINT "ProductionDailyLogItem_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX IF NOT EXISTS "ProductionDailyLog_logDate_createdById_key"
  ON "ProductionDailyLog"("logDate", "createdById");

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint WHERE conname = 'ProductionDailyLog_createdById_fkey'
  ) THEN
    ALTER TABLE "ProductionDailyLog"
      ADD CONSTRAINT "ProductionDailyLog_createdById_fkey"
      FOREIGN KEY ("createdById") REFERENCES "User"("id")
      ON DELETE RESTRICT ON UPDATE CASCADE;
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint WHERE conname = 'ProductionDailyLogItem_dailyLogId_fkey'
  ) THEN
    ALTER TABLE "ProductionDailyLogItem"
      ADD CONSTRAINT "ProductionDailyLogItem_dailyLogId_fkey"
      FOREIGN KEY ("dailyLogId") REFERENCES "ProductionDailyLog"("id")
      ON DELETE CASCADE ON UPDATE CASCADE;
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint WHERE conname = 'ProductionDailyLogItem_itemId_fkey'
  ) THEN
    ALTER TABLE "ProductionDailyLogItem"
      ADD CONSTRAINT "ProductionDailyLogItem_itemId_fkey"
      FOREIGN KEY ("itemId") REFERENCES "Item"("id")
      ON DELETE RESTRICT ON UPDATE CASCADE;
  END IF;
END $$;

ALTER TABLE "ProductionDailyLog" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "ProductionDailyLogItem" ENABLE ROW LEVEL SECURITY;

REVOKE ALL ON TABLE "ProductionDailyLog" FROM anon;
REVOKE ALL ON TABLE "ProductionDailyLog" FROM authenticated;
REVOKE ALL ON TABLE "ProductionDailyLogItem" FROM anon;
REVOKE ALL ON TABLE "ProductionDailyLogItem" FROM authenticated;
