DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_type WHERE typname = 'PurchaseRequestStatus') THEN
    CREATE TYPE "public"."PurchaseRequestStatus" AS ENUM (
      'ABERTA',
      'EM_COTACAO',
      'APROVADA',
      'REPROVADA',
      'CONVERTIDA_PEDIDO',
      'CANCELADA'
    );
  END IF;
END
$$;

CREATE TABLE IF NOT EXISTS "public"."PurchaseRequest" (
  "id" TEXT NOT NULL,
  "number" TEXT NOT NULL,
  "requesterId" TEXT NOT NULL,
  "department" TEXT,
  "costCenter" TEXT,
  "priority" TEXT NOT NULL DEFAULT 'NORMAL',
  "neededAt" TIMESTAMP(3),
  "status" "public"."PurchaseRequestStatus" NOT NULL DEFAULT 'ABERTA',
  "justification" TEXT,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL,

  CONSTRAINT "PurchaseRequest_pkey" PRIMARY KEY ("id")
);

CREATE TABLE IF NOT EXISTS "public"."PurchaseRequestItem" (
  "id" TEXT NOT NULL,
  "purchaseRequestId" TEXT NOT NULL,
  "itemId" TEXT NOT NULL,
  "quantity" DECIMAL(14,3) NOT NULL,
  "note" TEXT,

  CONSTRAINT "PurchaseRequestItem_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX IF NOT EXISTS "PurchaseRequest_number_key" ON "public"."PurchaseRequest"("number");

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint WHERE conname = 'PurchaseRequest_requesterId_fkey'
  ) THEN
    ALTER TABLE "public"."PurchaseRequest"
      ADD CONSTRAINT "PurchaseRequest_requesterId_fkey"
      FOREIGN KEY ("requesterId") REFERENCES "public"."User"("id")
      ON DELETE RESTRICT ON UPDATE CASCADE;
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint WHERE conname = 'PurchaseRequestItem_purchaseRequestId_fkey'
  ) THEN
    ALTER TABLE "public"."PurchaseRequestItem"
      ADD CONSTRAINT "PurchaseRequestItem_purchaseRequestId_fkey"
      FOREIGN KEY ("purchaseRequestId") REFERENCES "public"."PurchaseRequest"("id")
      ON DELETE CASCADE ON UPDATE CASCADE;
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint WHERE conname = 'PurchaseRequestItem_itemId_fkey'
  ) THEN
    ALTER TABLE "public"."PurchaseRequestItem"
      ADD CONSTRAINT "PurchaseRequestItem_itemId_fkey"
      FOREIGN KEY ("itemId") REFERENCES "public"."Item"("id")
      ON DELETE RESTRICT ON UPDATE CASCADE;
  END IF;
END
$$;

ALTER TABLE "public"."PurchaseRequest" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "public"."PurchaseRequestItem" ENABLE ROW LEVEL SECURITY;

REVOKE ALL ON TABLE "public"."PurchaseRequest" FROM anon, authenticated;
REVOKE ALL ON TABLE "public"."PurchaseRequestItem" FROM anon, authenticated;
