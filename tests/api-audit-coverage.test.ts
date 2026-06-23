import test from "node:test";
import assert from "node:assert/strict";
import { mkdirSync, mkdtempSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import { collectApiAuditCoverageErrors } from "../scripts/check-api-audit-coverage.mjs";

function writeRoute(cwd: string, relativeFile: string, content: string) {
  const file = path.join(cwd, relativeFile);
  mkdirSync(path.dirname(file), { recursive: true });
  writeFileSync(file, content, "utf8");
}

test("API audit guard blocks mutable route without audit coverage", async () => {
  const cwd = mkdtempSync(path.join(tmpdir(), "precast-api-audit-"));
  writeRoute(
    cwd,
    "src/app/api/produtos/route.ts",
    "export async function POST() { return Response.json({ ok: true }); }\n"
  );

  const errors = await collectApiAuditCoverageErrors({ cwd });

  assert.match(errors.join("\n"), /auditLog\.create|servico auditado/);
});

test("API audit guard accepts route with auditLog.create", async () => {
  const cwd = mkdtempSync(path.join(tmpdir(), "precast-api-audit-"));
  writeRoute(
    cwd,
    "src/app/api/produtos/route.ts",
    "export async function POST() { await prisma.auditLog.create({ data: {} }); return Response.json({ ok: true }); }\n"
  );

  const errors = await collectApiAuditCoverageErrors({ cwd });

  assert.deepEqual(errors, []);
});

test("API audit guard accepts route delegated to audited service", async () => {
  const cwd = mkdtempSync(path.join(tmpdir(), "precast-api-audit-"));
  writeRoute(
    cwd,
    "src/app/api/estoque/vendas/route.ts",
    "import { createDirectSale } from '@/lib/sales/direct-sale-service';\nexport async function POST() { await createDirectSale(prisma, input, session); return Response.json({ ok: true }); }\n"
  );

  const errors = await collectApiAuditCoverageErrors({ cwd });

  assert.deepEqual(errors, []);
});

test("API audit guard accepts documented non-database mutation", async () => {
  const cwd = mkdtempSync(path.join(tmpdir(), "precast-api-audit-"));
  writeRoute(
    cwd,
    "src/app/api/auth/logout/route.ts",
    "export async function POST() { return Response.json({ ok: true }); }\n"
  );

  const errors = await collectApiAuditCoverageErrors({ cwd });

  assert.deepEqual(errors, []);
});
