-- Supabase security baseline for the ERP MVP.
-- The app will access data through trusted Next.js server code using Prisma.
-- Public Data API access remains closed until policies are designed per module.

ALTER TABLE "User" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "Role" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "Permission" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "RolePermission" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "Company" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "Customer" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "Supplier" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "UnitOfMeasure" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "Item" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "Warehouse" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "Lot" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "StockBalance" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "StockMovement" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "Mold" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "Composition" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "CompositionItem" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "ProductionOrder" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "ProductionStage" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "ProductionNote" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "AuditLog" ENABLE ROW LEVEL SECURITY;

REVOKE ALL ON TABLE "User" FROM anon, authenticated;
REVOKE ALL ON TABLE "Role" FROM anon, authenticated;
REVOKE ALL ON TABLE "Permission" FROM anon, authenticated;
REVOKE ALL ON TABLE "RolePermission" FROM anon, authenticated;
REVOKE ALL ON TABLE "Company" FROM anon, authenticated;
REVOKE ALL ON TABLE "Customer" FROM anon, authenticated;
REVOKE ALL ON TABLE "Supplier" FROM anon, authenticated;
REVOKE ALL ON TABLE "UnitOfMeasure" FROM anon, authenticated;
REVOKE ALL ON TABLE "Item" FROM anon, authenticated;
REVOKE ALL ON TABLE "Warehouse" FROM anon, authenticated;
REVOKE ALL ON TABLE "Lot" FROM anon, authenticated;
REVOKE ALL ON TABLE "StockBalance" FROM anon, authenticated;
REVOKE ALL ON TABLE "StockMovement" FROM anon, authenticated;
REVOKE ALL ON TABLE "Mold" FROM anon, authenticated;
REVOKE ALL ON TABLE "Composition" FROM anon, authenticated;
REVOKE ALL ON TABLE "CompositionItem" FROM anon, authenticated;
REVOKE ALL ON TABLE "ProductionOrder" FROM anon, authenticated;
REVOKE ALL ON TABLE "ProductionStage" FROM anon, authenticated;
REVOKE ALL ON TABLE "ProductionNote" FROM anon, authenticated;
REVOKE ALL ON TABLE "AuditLog" FROM anon, authenticated;
