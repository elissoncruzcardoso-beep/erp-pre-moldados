DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_type WHERE typname = 'PurchaseReceiptStatus') THEN
    CREATE TYPE "PurchaseReceiptStatus" AS ENUM (
      'LIBERADO_ESTOQUE',
      'DIVERGENTE',
      'CANCELADO'
    );
  END IF;
END $$;

CREATE TABLE IF NOT EXISTS "PurchaseReceipt" (
  "id" TEXT NOT NULL,
  "number" TEXT NOT NULL,
  "purchaseOrderId" TEXT NOT NULL,
  "purchaseOrderItemId" TEXT NOT NULL,
  "warehouseId" TEXT NOT NULL,
  "lotId" TEXT,
  "stockMovementId" TEXT,
  "receivedById" TEXT NOT NULL,
  "status" "PurchaseReceiptStatus" NOT NULL DEFAULT 'LIBERADO_ESTOQUE',
  "invoiceNumber" TEXT,
  "supplierLot" TEXT,
  "receivedQuantity" DECIMAL(14,3) NOT NULL,
  "acceptedQuantity" DECIMAL(14,3) NOT NULL,
  "rejectedQuantity" DECIMAL(14,3) NOT NULL DEFAULT 0,
  "unitCost" DECIMAL(14,4) NOT NULL DEFAULT 0,
  "totalCost" DECIMAL(14,4) NOT NULL DEFAULT 0,
  "receivedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "note" TEXT,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL,

  CONSTRAINT "PurchaseReceipt_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX IF NOT EXISTS "PurchaseReceipt_number_key" ON "PurchaseReceipt"("number");
CREATE UNIQUE INDEX IF NOT EXISTS "PurchaseReceipt_stockMovementId_key" ON "PurchaseReceipt"("stockMovementId");

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint WHERE conname = 'PurchaseReceipt_purchaseOrderId_fkey'
  ) THEN
    ALTER TABLE "PurchaseReceipt"
      ADD CONSTRAINT "PurchaseReceipt_purchaseOrderId_fkey"
      FOREIGN KEY ("purchaseOrderId") REFERENCES "PurchaseOrder"("id")
      ON DELETE RESTRICT ON UPDATE CASCADE;
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint WHERE conname = 'PurchaseReceipt_purchaseOrderItemId_fkey'
  ) THEN
    ALTER TABLE "PurchaseReceipt"
      ADD CONSTRAINT "PurchaseReceipt_purchaseOrderItemId_fkey"
      FOREIGN KEY ("purchaseOrderItemId") REFERENCES "PurchaseOrderItem"("id")
      ON DELETE RESTRICT ON UPDATE CASCADE;
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint WHERE conname = 'PurchaseReceipt_warehouseId_fkey'
  ) THEN
    ALTER TABLE "PurchaseReceipt"
      ADD CONSTRAINT "PurchaseReceipt_warehouseId_fkey"
      FOREIGN KEY ("warehouseId") REFERENCES "Warehouse"("id")
      ON DELETE RESTRICT ON UPDATE CASCADE;
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint WHERE conname = 'PurchaseReceipt_lotId_fkey'
  ) THEN
    ALTER TABLE "PurchaseReceipt"
      ADD CONSTRAINT "PurchaseReceipt_lotId_fkey"
      FOREIGN KEY ("lotId") REFERENCES "Lot"("id")
      ON DELETE SET NULL ON UPDATE CASCADE;
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint WHERE conname = 'PurchaseReceipt_stockMovementId_fkey'
  ) THEN
    ALTER TABLE "PurchaseReceipt"
      ADD CONSTRAINT "PurchaseReceipt_stockMovementId_fkey"
      FOREIGN KEY ("stockMovementId") REFERENCES "StockMovement"("id")
      ON DELETE SET NULL ON UPDATE CASCADE;
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint WHERE conname = 'PurchaseReceipt_receivedById_fkey'
  ) THEN
    ALTER TABLE "PurchaseReceipt"
      ADD CONSTRAINT "PurchaseReceipt_receivedById_fkey"
      FOREIGN KEY ("receivedById") REFERENCES "User"("id")
      ON DELETE RESTRICT ON UPDATE CASCADE;
  END IF;
END $$;

ALTER TABLE "PurchaseReceipt" ENABLE ROW LEVEL SECURITY;

REVOKE ALL ON TABLE "PurchaseReceipt" FROM anon;
REVOKE ALL ON TABLE "PurchaseReceipt" FROM authenticated;
