-- CreateSchema
CREATE SCHEMA IF NOT EXISTS "public";

-- CreateEnum
CREATE TYPE "UserStatus" AS ENUM ('ACTIVE', 'INACTIVE');

-- CreateEnum
CREATE TYPE "ItemType" AS ENUM ('MATERIA_PRIMA', 'INSUMO', 'PRODUTO_ACABADO', 'PECA_PRE_MOLDADA', 'FORMA_MOLDE', 'SERVICO');

-- CreateEnum
CREATE TYPE "FinancialGroupType" AS ENUM ('ENTRADA', 'SAIDA');

-- CreateEnum
CREATE TYPE "ProductionOrderStatus" AS ENUM ('RASCUNHO', 'PLANEJADA', 'LIBERADA', 'EM_PRODUCAO', 'PAUSADA', 'AGUARDANDO_QUALIDADE', 'ENCERRADA', 'CANCELADA');

-- CreateEnum
CREATE TYPE "ProductionStageStatus" AS ENUM ('PENDENTE', 'EM_ANDAMENTO', 'CONCLUIDA', 'BLOQUEADA');

-- CreateEnum
CREATE TYPE "StockMovementType" AS ENUM ('ENTRADA_COMPRA', 'SAIDA_PRODUCAO', 'ENTRADA_PRODUCAO', 'TRANSFERENCIA', 'AJUSTE_POSITIVO', 'AJUSTE_NEGATIVO', 'RESERVA', 'ESTORNO');

-- CreateEnum
CREATE TYPE "LotStatus" AS ENUM ('LIBERADO', 'BLOQUEADO', 'EM_ANALISE', 'VENCIDO', 'CONSUMIDO');

-- CreateEnum
CREATE TYPE "PurchaseRequestStatus" AS ENUM ('ABERTA', 'EM_COTACAO', 'APROVADA', 'REPROVADA', 'CONVERTIDA_PEDIDO', 'CANCELADA');

-- CreateEnum
CREATE TYPE "PurchaseQuoteStatus" AS ENUM ('RECEBIDA', 'APROVADA', 'REPROVADA', 'CANCELADA');

-- CreateEnum
CREATE TYPE "PurchaseOrderStatus" AS ENUM ('EMITIDO', 'ENVIADO', 'PARCIALMENTE_RECEBIDO', 'RECEBIDO', 'CANCELADO');

-- CreateEnum
CREATE TYPE "PurchaseReceiptStatus" AS ENUM ('LIBERADO_ESTOQUE', 'DIVERGENTE', 'CANCELADO');

-- CreateEnum
CREATE TYPE "AccountPayableStatus" AS ENUM ('ABERTO', 'PROGRAMADO', 'PAGO', 'CANCELADO');

-- CreateEnum
CREATE TYPE "AccountReceivableStatus" AS ENUM ('ABERTO', 'FATURADO', 'RECEBIDO', 'CANCELADO');

-- CreateEnum
CREATE TYPE "DirectSaleStatus" AS ENUM ('ATIVA', 'CANCELADA');

-- CreateEnum
CREATE TYPE "ProductionBatchStatus" AS ENUM ('EM_CURA', 'APTA_RETIRADA', 'RETIRADA_PARCIAL', 'RETIRADA_TOTAL', 'BLOQUEADA');

-- CreateEnum
CREATE TYPE "AuditAction" AS ENUM ('LOGIN', 'CREATE', 'UPDATE', 'DELETE', 'APPROVE', 'CANCEL', 'STOCK_MOVE', 'STOCK_REVERSAL', 'PRODUCTION_START', 'PRODUCTION_CLOSE', 'PERMISSION_CHANGE');

-- CreateTable
CREATE TABLE "User" (
    "id" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "email" TEXT NOT NULL,
    "passwordHash" TEXT,
    "status" "UserStatus" NOT NULL DEFAULT 'ACTIVE',
    "department" TEXT,
    "roleId" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "User_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Role" (
    "id" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "description" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "Role_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Permission" (
    "id" TEXT NOT NULL,
    "key" TEXT NOT NULL,
    "module" TEXT NOT NULL,
    "description" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "Permission_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "RolePermission" (
    "roleId" TEXT NOT NULL,
    "permissionId" TEXT NOT NULL,

    CONSTRAINT "RolePermission_pkey" PRIMARY KEY ("roleId","permissionId")
);

-- CreateTable
CREATE TABLE "Company" (
    "id" TEXT NOT NULL,
    "legalName" TEXT NOT NULL,
    "tradeName" TEXT,
    "document" TEXT,
    "active" BOOLEAN NOT NULL DEFAULT true,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "Company_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Customer" (
    "id" TEXT NOT NULL,
    "code" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "document" TEXT,
    "email" TEXT,
    "phone" TEXT,
    "address" TEXT,
    "city" TEXT,
    "state" TEXT,
    "active" BOOLEAN NOT NULL DEFAULT true,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "Customer_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "PaymentMethod" (
    "id" TEXT NOT NULL,
    "code" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "type" TEXT NOT NULL DEFAULT 'A_VISTA',
    "active" BOOLEAN NOT NULL DEFAULT true,
    "note" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "PaymentMethod_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "FinancialSettlementType" (
    "id" TEXT NOT NULL,
    "code" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "direction" TEXT NOT NULL DEFAULT 'ENTRADA',
    "active" BOOLEAN NOT NULL DEFAULT true,
    "note" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "FinancialSettlementType_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Supplier" (
    "id" TEXT NOT NULL,
    "code" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "document" TEXT,
    "email" TEXT,
    "phone" TEXT,
    "active" BOOLEAN NOT NULL DEFAULT true,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "Supplier_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "UnitOfMeasure" (
    "id" TEXT NOT NULL,
    "code" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "decimals" INTEGER NOT NULL DEFAULT 2,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "UnitOfMeasure_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "InputGroup" (
    "id" TEXT NOT NULL,
    "code" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "type" "ItemType" NOT NULL DEFAULT 'INSUMO',
    "defaultFinancialGroupId" TEXT,
    "controlsStock" BOOLEAN NOT NULL DEFAULT true,
    "active" BOOLEAN NOT NULL DEFAULT true,
    "note" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "InputGroup_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "FinancialGroup" (
    "id" TEXT NOT NULL,
    "code" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "type" "FinancialGroupType" NOT NULL,
    "category" TEXT,
    "costCenter" TEXT,
    "active" BOOLEAN NOT NULL DEFAULT true,
    "note" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "FinancialGroup_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Item" (
    "id" TEXT NOT NULL,
    "code" TEXT NOT NULL,
    "description" TEXT NOT NULL,
    "type" "ItemType" NOT NULL,
    "group" TEXT,
    "unitId" TEXT NOT NULL,
    "controlsStock" BOOLEAN NOT NULL DEFAULT true,
    "controlsLot" BOOLEAN NOT NULL DEFAULT false,
    "minimumStock" DECIMAL(14,3) NOT NULL DEFAULT 0,
    "standardCost" DECIMAL(14,4) NOT NULL DEFAULT 0,
    "curingHours" INTEGER NOT NULL DEFAULT 24,
    "active" BOOLEAN NOT NULL DEFAULT true,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "Item_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Warehouse" (
    "id" TEXT NOT NULL,
    "code" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "type" TEXT,
    "allowsNegative" BOOLEAN NOT NULL DEFAULT false,
    "active" BOOLEAN NOT NULL DEFAULT true,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "Warehouse_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Lot" (
    "id" TEXT NOT NULL,
    "code" TEXT NOT NULL,
    "itemId" TEXT NOT NULL,
    "supplierId" TEXT,
    "supplierLot" TEXT,
    "manufacturedAt" TIMESTAMP(3),
    "expiresAt" TIMESTAMP(3),
    "status" "LotStatus" NOT NULL DEFAULT 'EM_ANALISE',
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "Lot_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "StockBalance" (
    "id" TEXT NOT NULL,
    "itemId" TEXT NOT NULL,
    "warehouseId" TEXT NOT NULL,
    "lotId" TEXT,
    "quantity" DECIMAL(14,3) NOT NULL DEFAULT 0,
    "reserved" DECIMAL(14,3) NOT NULL DEFAULT 0,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "StockBalance_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "StockMovement" (
    "id" TEXT NOT NULL,
    "type" "StockMovementType" NOT NULL,
    "itemId" TEXT NOT NULL,
    "quantity" DECIMAL(14,3) NOT NULL,
    "unitCost" DECIMAL(14,4) NOT NULL DEFAULT 0,
    "totalCost" DECIMAL(14,4) NOT NULL DEFAULT 0,
    "originWarehouseId" TEXT,
    "targetWarehouseId" TEXT,
    "lotId" TEXT,
    "productionOrderId" TEXT,
    "userId" TEXT NOT NULL,
    "document" TEXT,
    "justification" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "StockMovement_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "DirectSale" (
    "id" TEXT NOT NULL,
    "number" TEXT NOT NULL,
    "customerId" TEXT,
    "customerName" TEXT NOT NULL,
    "customerDocument" TEXT,
    "itemId" TEXT NOT NULL,
    "warehouseId" TEXT NOT NULL,
    "stockMovementId" TEXT,
    "createdById" TEXT NOT NULL,
    "cancelledById" TEXT,
    "status" "DirectSaleStatus" NOT NULL DEFAULT 'ATIVA',
    "quantity" DECIMAL(14,3) NOT NULL,
    "unitPrice" DECIMAL(14,4) NOT NULL DEFAULT 0,
    "grossTotal" DECIMAL(14,4) NOT NULL DEFAULT 0,
    "discount" DECIMAL(14,4) NOT NULL DEFAULT 0,
    "finalTotal" DECIMAL(14,4) NOT NULL DEFAULT 0,
    "paymentMethod" TEXT,
    "note" TEXT,
    "consumedLots" JSONB,
    "issuedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "cancelledAt" TIMESTAMP(3),
    "cancelReason" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "DirectSale_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "PurchaseRequest" (
    "id" TEXT NOT NULL,
    "number" TEXT NOT NULL,
    "requesterId" TEXT NOT NULL,
    "department" TEXT,
    "costCenter" TEXT,
    "priority" TEXT NOT NULL DEFAULT 'NORMAL',
    "neededAt" TIMESTAMP(3),
    "status" "PurchaseRequestStatus" NOT NULL DEFAULT 'ABERTA',
    "justification" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "PurchaseRequest_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "PurchaseRequestItem" (
    "id" TEXT NOT NULL,
    "purchaseRequestId" TEXT NOT NULL,
    "itemId" TEXT NOT NULL,
    "quantity" DECIMAL(14,3) NOT NULL,
    "note" TEXT,

    CONSTRAINT "PurchaseRequestItem_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "PurchaseQuote" (
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

-- CreateTable
CREATE TABLE "PurchaseQuoteItem" (
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

-- CreateTable
CREATE TABLE "PurchaseOrder" (
    "id" TEXT NOT NULL,
    "number" TEXT NOT NULL,
    "purchaseQuoteId" TEXT NOT NULL,
    "purchaseRequestId" TEXT NOT NULL,
    "supplierId" TEXT NOT NULL,
    "createdById" TEXT NOT NULL,
    "status" "PurchaseOrderStatus" NOT NULL DEFAULT 'EMITIDO',
    "issuedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "expectedDeliveryAt" TIMESTAMP(3),
    "paymentTerms" TEXT,
    "freightCost" DECIMAL(14,4) NOT NULL DEFAULT 0,
    "totalValue" DECIMAL(14,4) NOT NULL,
    "note" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "PurchaseOrder_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "PurchaseOrderItem" (
    "id" TEXT NOT NULL,
    "purchaseOrderId" TEXT NOT NULL,
    "itemId" TEXT NOT NULL,
    "quantity" DECIMAL(14,3) NOT NULL,
    "unitPrice" DECIMAL(14,4) NOT NULL DEFAULT 0,
    "totalValue" DECIMAL(14,4) NOT NULL DEFAULT 0,
    "note" TEXT,

    CONSTRAINT "PurchaseOrderItem_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "PurchaseReceipt" (
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

-- CreateTable
CREATE TABLE "AccountPayable" (
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

-- CreateTable
CREATE TABLE "AccountPayment" (
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

-- CreateTable
CREATE TABLE "AccountReceivable" (
    "id" TEXT NOT NULL,
    "number" TEXT NOT NULL,
    "directSaleId" TEXT,
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

-- CreateTable
CREATE TABLE "AccountReceipt" (
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

-- CreateTable
CREATE TABLE "Mold" (
    "id" TEXT NOT NULL,
    "code" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "capacity" DECIMAL(14,3),
    "active" BOOLEAN NOT NULL DEFAULT true,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "Mold_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Composition" (
    "id" TEXT NOT NULL,
    "code" TEXT NOT NULL,
    "productId" TEXT NOT NULL,
    "version" TEXT NOT NULL,
    "revision" TEXT NOT NULL,
    "baseQuantity" DECIMAL(14,3) NOT NULL DEFAULT 1,
    "expectedLoss" DECIMAL(6,3) NOT NULL DEFAULT 0,
    "curingHours" INTEGER,
    "approved" BOOLEAN NOT NULL DEFAULT false,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "Composition_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "CompositionItem" (
    "id" TEXT NOT NULL,
    "compositionId" TEXT NOT NULL,
    "itemId" TEXT NOT NULL,
    "quantity" DECIMAL(14,3) NOT NULL,
    "lossPercent" DECIMAL(6,3) NOT NULL DEFAULT 0,
    "stage" TEXT,

    CONSTRAINT "CompositionItem_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "ProductionOrder" (
    "id" TEXT NOT NULL,
    "number" TEXT NOT NULL,
    "productId" TEXT NOT NULL,
    "compositionId" TEXT,
    "moldId" TEXT,
    "customerId" TEXT,
    "plannedQuantity" DECIMAL(14,3) NOT NULL,
    "producedQuantity" DECIMAL(14,3) NOT NULL DEFAULT 0,
    "expectedDate" TIMESTAMP(3),
    "status" "ProductionOrderStatus" NOT NULL DEFAULT 'RASCUNHO',
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "ProductionOrder_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "ProductionStage" (
    "id" TEXT NOT NULL,
    "productionOrderId" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "sequence" INTEGER NOT NULL,
    "status" "ProductionStageStatus" NOT NULL DEFAULT 'PENDENTE',
    "startedAt" TIMESTAMP(3),
    "finishedAt" TIMESTAMP(3),

    CONSTRAINT "ProductionStage_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "ProductionNote" (
    "id" TEXT NOT NULL,
    "productionOrderId" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "stage" TEXT NOT NULL,
    "producedQuantity" DECIMAL(14,3) NOT NULL DEFAULT 0,
    "lossQuantity" DECIMAL(14,3) NOT NULL DEFAULT 0,
    "scrapQuantity" DECIMAL(14,3) NOT NULL DEFAULT 0,
    "downtimeMinutes" INTEGER NOT NULL DEFAULT 0,
    "note" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "ProductionNote_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "ProductionDailyLog" (
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

-- CreateTable
CREATE TABLE "ProductionDailyLogItem" (
    "id" TEXT NOT NULL,
    "dailyLogId" TEXT NOT NULL,
    "itemId" TEXT NOT NULL,
    "quantity" DECIMAL(14,3) NOT NULL,
    "note" TEXT,

    CONSTRAINT "ProductionDailyLogItem_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "ProductionBatch" (
    "id" TEXT NOT NULL,
    "code" TEXT NOT NULL,
    "dailyLogItemId" TEXT NOT NULL,
    "itemId" TEXT NOT NULL,
    "producedQuantity" DECIMAL(14,3) NOT NULL,
    "curingQuantity" DECIMAL(14,3) NOT NULL,
    "releasedQuantity" DECIMAL(14,3) NOT NULL DEFAULT 0,
    "status" "ProductionBatchStatus" NOT NULL DEFAULT 'EM_CURA',
    "producedAt" TIMESTAMP(3) NOT NULL,
    "readyAt" TIMESTAMP(3),
    "autoStockedAt" TIMESTAMP(3),
    "releasedAt" TIMESTAMP(3),
    "releasedById" TEXT,
    "releaseResponsible" TEXT,
    "releaseNote" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "ProductionBatch_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "AuditLog" (
    "id" TEXT NOT NULL,
    "userId" TEXT,
    "module" TEXT NOT NULL,
    "action" "AuditAction" NOT NULL,
    "entity" TEXT NOT NULL,
    "entityId" TEXT,
    "previousValue" JSONB,
    "newValue" JSONB,
    "justification" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "AuditLog_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "User_email_key" ON "User"("email");

-- CreateIndex
CREATE UNIQUE INDEX "Role_name_key" ON "Role"("name");

-- CreateIndex
CREATE UNIQUE INDEX "Permission_key_key" ON "Permission"("key");

-- CreateIndex
CREATE UNIQUE INDEX "Company_document_key" ON "Company"("document");

-- CreateIndex
CREATE UNIQUE INDEX "Customer_code_key" ON "Customer"("code");

-- CreateIndex
CREATE UNIQUE INDEX "PaymentMethod_code_key" ON "PaymentMethod"("code");

-- CreateIndex
CREATE UNIQUE INDEX "FinancialSettlementType_code_key" ON "FinancialSettlementType"("code");

-- CreateIndex
CREATE UNIQUE INDEX "Supplier_code_key" ON "Supplier"("code");

-- CreateIndex
CREATE UNIQUE INDEX "UnitOfMeasure_code_key" ON "UnitOfMeasure"("code");

-- CreateIndex
CREATE UNIQUE INDEX "InputGroup_code_key" ON "InputGroup"("code");

-- CreateIndex
CREATE UNIQUE INDEX "InputGroup_name_key" ON "InputGroup"("name");

-- CreateIndex
CREATE UNIQUE INDEX "FinancialGroup_code_key" ON "FinancialGroup"("code");

-- CreateIndex
CREATE UNIQUE INDEX "Item_code_key" ON "Item"("code");

-- CreateIndex
CREATE UNIQUE INDEX "Warehouse_code_key" ON "Warehouse"("code");

-- CreateIndex
CREATE UNIQUE INDEX "Lot_code_key" ON "Lot"("code");

-- CreateIndex
CREATE UNIQUE INDEX "StockBalance_itemId_warehouseId_lotId_key" ON "StockBalance"("itemId", "warehouseId", "lotId");

-- CreateIndex
CREATE UNIQUE INDEX "DirectSale_number_key" ON "DirectSale"("number");

-- CreateIndex
CREATE UNIQUE INDEX "DirectSale_stockMovementId_key" ON "DirectSale"("stockMovementId");

-- CreateIndex
CREATE UNIQUE INDEX "PurchaseRequest_number_key" ON "PurchaseRequest"("number");

-- CreateIndex
CREATE UNIQUE INDEX "PurchaseQuote_number_key" ON "PurchaseQuote"("number");

-- CreateIndex
CREATE UNIQUE INDEX "PurchaseQuoteItem_purchaseQuoteId_purchaseRequestItemId_key" ON "PurchaseQuoteItem"("purchaseQuoteId", "purchaseRequestItemId");

-- CreateIndex
CREATE UNIQUE INDEX "PurchaseOrder_number_key" ON "PurchaseOrder"("number");

-- CreateIndex
CREATE UNIQUE INDEX "PurchaseOrder_purchaseQuoteId_key" ON "PurchaseOrder"("purchaseQuoteId");

-- CreateIndex
CREATE UNIQUE INDEX "PurchaseReceipt_number_key" ON "PurchaseReceipt"("number");

-- CreateIndex
CREATE UNIQUE INDEX "PurchaseReceipt_stockMovementId_key" ON "PurchaseReceipt"("stockMovementId");

-- CreateIndex
CREATE UNIQUE INDEX "AccountPayable_number_key" ON "AccountPayable"("number");

-- CreateIndex
CREATE UNIQUE INDEX "AccountPayable_purchaseReceiptId_key" ON "AccountPayable"("purchaseReceiptId");

-- CreateIndex
CREATE UNIQUE INDEX "AccountReceivable_number_key" ON "AccountReceivable"("number");

-- CreateIndex
CREATE UNIQUE INDEX "Mold_code_key" ON "Mold"("code");

-- CreateIndex
CREATE UNIQUE INDEX "Composition_code_key" ON "Composition"("code");

-- CreateIndex
CREATE UNIQUE INDEX "ProductionOrder_number_key" ON "ProductionOrder"("number");

-- CreateIndex
CREATE UNIQUE INDEX "ProductionDailyLog_logDate_createdById_key" ON "ProductionDailyLog"("logDate", "createdById");

-- CreateIndex
CREATE UNIQUE INDEX "ProductionBatch_code_key" ON "ProductionBatch"("code");

-- CreateIndex
CREATE UNIQUE INDEX "ProductionBatch_dailyLogItemId_key" ON "ProductionBatch"("dailyLogItemId");

-- AddForeignKey
ALTER TABLE "User" ADD CONSTRAINT "User_roleId_fkey" FOREIGN KEY ("roleId") REFERENCES "Role"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "RolePermission" ADD CONSTRAINT "RolePermission_roleId_fkey" FOREIGN KEY ("roleId") REFERENCES "Role"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "RolePermission" ADD CONSTRAINT "RolePermission_permissionId_fkey" FOREIGN KEY ("permissionId") REFERENCES "Permission"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "InputGroup" ADD CONSTRAINT "InputGroup_defaultFinancialGroupId_fkey" FOREIGN KEY ("defaultFinancialGroupId") REFERENCES "FinancialGroup"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Item" ADD CONSTRAINT "Item_unitId_fkey" FOREIGN KEY ("unitId") REFERENCES "UnitOfMeasure"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Lot" ADD CONSTRAINT "Lot_itemId_fkey" FOREIGN KEY ("itemId") REFERENCES "Item"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Lot" ADD CONSTRAINT "Lot_supplierId_fkey" FOREIGN KEY ("supplierId") REFERENCES "Supplier"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "StockBalance" ADD CONSTRAINT "StockBalance_itemId_fkey" FOREIGN KEY ("itemId") REFERENCES "Item"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "StockBalance" ADD CONSTRAINT "StockBalance_warehouseId_fkey" FOREIGN KEY ("warehouseId") REFERENCES "Warehouse"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "StockBalance" ADD CONSTRAINT "StockBalance_lotId_fkey" FOREIGN KEY ("lotId") REFERENCES "Lot"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "StockMovement" ADD CONSTRAINT "StockMovement_itemId_fkey" FOREIGN KEY ("itemId") REFERENCES "Item"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "StockMovement" ADD CONSTRAINT "StockMovement_originWarehouseId_fkey" FOREIGN KEY ("originWarehouseId") REFERENCES "Warehouse"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "StockMovement" ADD CONSTRAINT "StockMovement_targetWarehouseId_fkey" FOREIGN KEY ("targetWarehouseId") REFERENCES "Warehouse"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "StockMovement" ADD CONSTRAINT "StockMovement_lotId_fkey" FOREIGN KEY ("lotId") REFERENCES "Lot"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "StockMovement" ADD CONSTRAINT "StockMovement_productionOrderId_fkey" FOREIGN KEY ("productionOrderId") REFERENCES "ProductionOrder"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "StockMovement" ADD CONSTRAINT "StockMovement_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "DirectSale" ADD CONSTRAINT "DirectSale_customerId_fkey" FOREIGN KEY ("customerId") REFERENCES "Customer"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "DirectSale" ADD CONSTRAINT "DirectSale_itemId_fkey" FOREIGN KEY ("itemId") REFERENCES "Item"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "DirectSale" ADD CONSTRAINT "DirectSale_warehouseId_fkey" FOREIGN KEY ("warehouseId") REFERENCES "Warehouse"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "DirectSale" ADD CONSTRAINT "DirectSale_stockMovementId_fkey" FOREIGN KEY ("stockMovementId") REFERENCES "StockMovement"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "DirectSale" ADD CONSTRAINT "DirectSale_createdById_fkey" FOREIGN KEY ("createdById") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "DirectSale" ADD CONSTRAINT "DirectSale_cancelledById_fkey" FOREIGN KEY ("cancelledById") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "PurchaseRequest" ADD CONSTRAINT "PurchaseRequest_requesterId_fkey" FOREIGN KEY ("requesterId") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "PurchaseRequestItem" ADD CONSTRAINT "PurchaseRequestItem_purchaseRequestId_fkey" FOREIGN KEY ("purchaseRequestId") REFERENCES "PurchaseRequest"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "PurchaseRequestItem" ADD CONSTRAINT "PurchaseRequestItem_itemId_fkey" FOREIGN KEY ("itemId") REFERENCES "Item"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "PurchaseQuote" ADD CONSTRAINT "PurchaseQuote_purchaseRequestId_fkey" FOREIGN KEY ("purchaseRequestId") REFERENCES "PurchaseRequest"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "PurchaseQuote" ADD CONSTRAINT "PurchaseQuote_supplierId_fkey" FOREIGN KEY ("supplierId") REFERENCES "Supplier"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "PurchaseQuote" ADD CONSTRAINT "PurchaseQuote_createdById_fkey" FOREIGN KEY ("createdById") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "PurchaseQuoteItem" ADD CONSTRAINT "PurchaseQuoteItem_purchaseQuoteId_fkey" FOREIGN KEY ("purchaseQuoteId") REFERENCES "PurchaseQuote"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "PurchaseQuoteItem" ADD CONSTRAINT "PurchaseQuoteItem_purchaseRequestItemId_fkey" FOREIGN KEY ("purchaseRequestItemId") REFERENCES "PurchaseRequestItem"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "PurchaseQuoteItem" ADD CONSTRAINT "PurchaseQuoteItem_itemId_fkey" FOREIGN KEY ("itemId") REFERENCES "Item"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "PurchaseQuoteItem" ADD CONSTRAINT "PurchaseQuoteItem_supplierId_fkey" FOREIGN KEY ("supplierId") REFERENCES "Supplier"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "PurchaseOrder" ADD CONSTRAINT "PurchaseOrder_purchaseQuoteId_fkey" FOREIGN KEY ("purchaseQuoteId") REFERENCES "PurchaseQuote"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "PurchaseOrder" ADD CONSTRAINT "PurchaseOrder_purchaseRequestId_fkey" FOREIGN KEY ("purchaseRequestId") REFERENCES "PurchaseRequest"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "PurchaseOrder" ADD CONSTRAINT "PurchaseOrder_supplierId_fkey" FOREIGN KEY ("supplierId") REFERENCES "Supplier"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "PurchaseOrder" ADD CONSTRAINT "PurchaseOrder_createdById_fkey" FOREIGN KEY ("createdById") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "PurchaseOrderItem" ADD CONSTRAINT "PurchaseOrderItem_purchaseOrderId_fkey" FOREIGN KEY ("purchaseOrderId") REFERENCES "PurchaseOrder"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "PurchaseOrderItem" ADD CONSTRAINT "PurchaseOrderItem_itemId_fkey" FOREIGN KEY ("itemId") REFERENCES "Item"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "PurchaseReceipt" ADD CONSTRAINT "PurchaseReceipt_purchaseOrderId_fkey" FOREIGN KEY ("purchaseOrderId") REFERENCES "PurchaseOrder"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "PurchaseReceipt" ADD CONSTRAINT "PurchaseReceipt_purchaseOrderItemId_fkey" FOREIGN KEY ("purchaseOrderItemId") REFERENCES "PurchaseOrderItem"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "PurchaseReceipt" ADD CONSTRAINT "PurchaseReceipt_warehouseId_fkey" FOREIGN KEY ("warehouseId") REFERENCES "Warehouse"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "PurchaseReceipt" ADD CONSTRAINT "PurchaseReceipt_lotId_fkey" FOREIGN KEY ("lotId") REFERENCES "Lot"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "PurchaseReceipt" ADD CONSTRAINT "PurchaseReceipt_stockMovementId_fkey" FOREIGN KEY ("stockMovementId") REFERENCES "StockMovement"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "PurchaseReceipt" ADD CONSTRAINT "PurchaseReceipt_receivedById_fkey" FOREIGN KEY ("receivedById") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "AccountPayable" ADD CONSTRAINT "AccountPayable_purchaseReceiptId_fkey" FOREIGN KEY ("purchaseReceiptId") REFERENCES "PurchaseReceipt"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "AccountPayable" ADD CONSTRAINT "AccountPayable_supplierId_fkey" FOREIGN KEY ("supplierId") REFERENCES "Supplier"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "AccountPayable" ADD CONSTRAINT "AccountPayable_createdById_fkey" FOREIGN KEY ("createdById") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "AccountPayment" ADD CONSTRAINT "AccountPayment_accountPayableId_fkey" FOREIGN KEY ("accountPayableId") REFERENCES "AccountPayable"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "AccountPayment" ADD CONSTRAINT "AccountPayment_paidById_fkey" FOREIGN KEY ("paidById") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "AccountReceivable" ADD CONSTRAINT "AccountReceivable_directSaleId_fkey" FOREIGN KEY ("directSaleId") REFERENCES "DirectSale"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "AccountReceivable" ADD CONSTRAINT "AccountReceivable_customerId_fkey" FOREIGN KEY ("customerId") REFERENCES "Customer"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "AccountReceivable" ADD CONSTRAINT "AccountReceivable_createdById_fkey" FOREIGN KEY ("createdById") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "AccountReceipt" ADD CONSTRAINT "AccountReceipt_accountReceivableId_fkey" FOREIGN KEY ("accountReceivableId") REFERENCES "AccountReceivable"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "AccountReceipt" ADD CONSTRAINT "AccountReceipt_receivedById_fkey" FOREIGN KEY ("receivedById") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Composition" ADD CONSTRAINT "Composition_productId_fkey" FOREIGN KEY ("productId") REFERENCES "Item"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "CompositionItem" ADD CONSTRAINT "CompositionItem_compositionId_fkey" FOREIGN KEY ("compositionId") REFERENCES "Composition"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "CompositionItem" ADD CONSTRAINT "CompositionItem_itemId_fkey" FOREIGN KEY ("itemId") REFERENCES "Item"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ProductionOrder" ADD CONSTRAINT "ProductionOrder_productId_fkey" FOREIGN KEY ("productId") REFERENCES "Item"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ProductionOrder" ADD CONSTRAINT "ProductionOrder_compositionId_fkey" FOREIGN KEY ("compositionId") REFERENCES "Composition"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ProductionOrder" ADD CONSTRAINT "ProductionOrder_moldId_fkey" FOREIGN KEY ("moldId") REFERENCES "Mold"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ProductionOrder" ADD CONSTRAINT "ProductionOrder_customerId_fkey" FOREIGN KEY ("customerId") REFERENCES "Customer"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ProductionStage" ADD CONSTRAINT "ProductionStage_productionOrderId_fkey" FOREIGN KEY ("productionOrderId") REFERENCES "ProductionOrder"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ProductionNote" ADD CONSTRAINT "ProductionNote_productionOrderId_fkey" FOREIGN KEY ("productionOrderId") REFERENCES "ProductionOrder"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ProductionNote" ADD CONSTRAINT "ProductionNote_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ProductionDailyLog" ADD CONSTRAINT "ProductionDailyLog_createdById_fkey" FOREIGN KEY ("createdById") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ProductionDailyLogItem" ADD CONSTRAINT "ProductionDailyLogItem_dailyLogId_fkey" FOREIGN KEY ("dailyLogId") REFERENCES "ProductionDailyLog"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ProductionDailyLogItem" ADD CONSTRAINT "ProductionDailyLogItem_itemId_fkey" FOREIGN KEY ("itemId") REFERENCES "Item"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ProductionBatch" ADD CONSTRAINT "ProductionBatch_dailyLogItemId_fkey" FOREIGN KEY ("dailyLogItemId") REFERENCES "ProductionDailyLogItem"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ProductionBatch" ADD CONSTRAINT "ProductionBatch_itemId_fkey" FOREIGN KEY ("itemId") REFERENCES "Item"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ProductionBatch" ADD CONSTRAINT "ProductionBatch_releasedById_fkey" FOREIGN KEY ("releasedById") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "AuditLog" ADD CONSTRAINT "AuditLog_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;
