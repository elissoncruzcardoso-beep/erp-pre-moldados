import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import path from "node:path";
import {
  buildSecurityReadinessReport,
  collectSecretLeaks
} from "../scripts/security-readiness-report.mjs";

function okCheck(key: string, label: string, critical = true) {
  return {
    key,
    label,
    critical,
    ok: true,
    status: "OK",
    warnings: [],
    errors: []
  };
}

test("security readiness report is ready when all checks pass", () => {
  const report = buildSecurityReadinessReport({
    generatedAt: "2026-06-18T12:00:00.000Z",
    checks: [
      okCheck("env", "Ambiente"),
      okCheck("apiAuth", "Autenticacao API"),
      okCheck("backupDr", "Backup e DR")
    ]
  });

  assert.equal(report.status, "PRONTO");
  assert.equal(report.ready, true);
  assert.deepEqual(report.blockers, []);
});

test("security readiness report blocks critical failures", () => {
  const report = buildSecurityReadinessReport({
    generatedAt: "2026-06-18T12:00:00.000Z",
    checks: [
      okCheck("env", "Ambiente"),
      {
        key: "supabaseRls",
        label: "Supabase RLS",
        critical: true,
        ok: false,
        status: "BLOQUEADO",
        warnings: [],
        errors: ["RLS ausente"]
      }
    ]
  });

  assert.equal(report.status, "BLOQUEADO");
  assert.equal(report.ready, false);
  assert.match(report.blockers.join("\n"), /RLS ausente/);
});

test("security readiness report is partial for non-critical warnings", () => {
  const report = buildSecurityReadinessReport({
    generatedAt: "2026-06-18T12:00:00.000Z",
    checks: [
      okCheck("env", "Ambiente"),
      {
        key: "queryLimits",
        label: "Limites de consulta",
        critical: false,
        ok: false,
        status: "PARCIAL",
        warnings: [],
        errors: ["consulta sem limite documentado"]
      }
    ]
  });

  assert.equal(report.status, "PARCIAL");
  assert.equal(report.ready, false);
  assert.match(report.warnings.join("\n"), /consulta sem limite/);
});

test("security readiness report blocks if generated data would leak secrets", () => {
  const report = buildSecurityReadinessReport({
    generatedAt: "2026-06-18T12:00:00.000Z",
    checks: [
      {
        key: "env",
        label: "Ambiente",
        critical: true,
        ok: true,
        status: "OK",
        warnings: ["AUTH_SECRET=abc"],
        errors: []
      }
    ]
  });

  assert.equal(report.status, "BLOQUEADO");
  assert.match(report.blockers.join("\n"), /valor sensivel/);
});

test("security readiness secret collector detects credential URLs", () => {
  const leaks = collectSecretLeaks({
    nested: {
      value: "postgresql://user:password@db.example.com:5432/postgres"
    }
  });

  assert.deepEqual(leaks, ["nested.value"]);
});

test("security readiness runner calls node scripts directly instead of nesting npm run", () => {
  const script = readFileSync(
    path.join(process.cwd(), "scripts", "security-readiness-report.mjs"),
    "utf8"
  );

  assert.match(script, /const nodeCommand = process\.execPath/);
  assert.doesNotMatch(script, /npm\.cmd/);
  assert.doesNotMatch(script, /run", "--silent"/);
});

test("security readiness includes API observability guard", () => {
  const script = readFileSync(
    path.join(process.cwd(), "scripts", "security-readiness-report.mjs"),
    "utf8"
  );

  assert.match(script, /key:\s*"apiObservability"/);
  assert.match(script, /scripts\/check-api-observability\.mjs/);
});
