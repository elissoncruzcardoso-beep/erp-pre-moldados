-- Close public Data API access for tables added after the initial RLS baseline.
-- The ERP reads/writes through trusted Next.js server routes using Prisma.
-- Do not add broad anon/authenticated policies here; module-level access stays in the app.

ALTER TABLE "DirectSale" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "FinancialGroup" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "FinancialSettlementType" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "InputGroup" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "PaymentMethod" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "ProductionBatch" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "ProductionDailyLog" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "ProductionDailyLogItem" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "PurchaseQuoteItem" ENABLE ROW LEVEL SECURITY;

REVOKE ALL ON TABLE "DirectSale" FROM anon;
REVOKE ALL ON TABLE "DirectSale" FROM authenticated;
REVOKE ALL ON TABLE "FinancialGroup" FROM anon;
REVOKE ALL ON TABLE "FinancialGroup" FROM authenticated;
REVOKE ALL ON TABLE "FinancialSettlementType" FROM anon;
REVOKE ALL ON TABLE "FinancialSettlementType" FROM authenticated;
REVOKE ALL ON TABLE "InputGroup" FROM anon;
REVOKE ALL ON TABLE "InputGroup" FROM authenticated;
REVOKE ALL ON TABLE "PaymentMethod" FROM anon;
REVOKE ALL ON TABLE "PaymentMethod" FROM authenticated;
REVOKE ALL ON TABLE "ProductionBatch" FROM anon;
REVOKE ALL ON TABLE "ProductionBatch" FROM authenticated;
REVOKE ALL ON TABLE "ProductionDailyLog" FROM anon;
REVOKE ALL ON TABLE "ProductionDailyLog" FROM authenticated;
REVOKE ALL ON TABLE "ProductionDailyLogItem" FROM anon;
REVOKE ALL ON TABLE "ProductionDailyLogItem" FROM authenticated;
REVOKE ALL ON TABLE "PurchaseQuoteItem" FROM anon;
REVOKE ALL ON TABLE "PurchaseQuoteItem" FROM authenticated;
