import test from "node:test";
import assert from "node:assert/strict";
import { mkdtempSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import {
  buildHealthEvidence,
  checkHealthEvidenceFile,
  evaluateHealthResponse,
  normalizeHealthUrl,
  resolveHealthUrl,
  sanitizeUrlForLog,
  validateHealthEvidence
} from "../scripts/monitoring/check-health-url.mjs";

test("health URL monitor normalizes app URL to api health endpoint", () => {
  assert.equal(
    normalizeHealthUrl("https://erp-pre-moldados-prototype.vercel.app"),
    "https://erp-pre-moldados-prototype.vercel.app/api/health"
  );

  assert.equal(
    normalizeHealthUrl("erp-pre-moldados-prototype.vercel.app"),
    "https://erp-pre-moldados-prototype.vercel.app/api/health"
  );
});

test("health URL monitor keeps explicit health endpoint", () => {
  assert.equal(
    normalizeHealthUrl("https://example.com/api/health"),
    "https://example.com/api/health"
  );
});

test("health URL monitor resolves explicit argument before environment", () => {
  const url = resolveHealthUrl({
    args: ["--url", "https://manual.example.com"],
    env: {
      HEALTHCHECK_URL: "https://env.example.com"
    } as NodeJS.ProcessEnv
  });

  assert.equal(url, "https://manual.example.com/api/health");
});

test("health URL monitor rejects degraded database response", () => {
  const result = evaluateHealthResponse({
    statusCode: 503,
    body: {
      ok: false,
      status: "degraded",
      checks: {
        app: "ok",
        database: "degraded"
      }
    }
  });

  assert.equal(result.ok, false);
  assert.match(result.errors.join("\n"), /banco de dados/);
});

test("health URL monitor accepts healthy response", () => {
  const result = evaluateHealthResponse({
    statusCode: 200,
    body: {
      ok: true,
      status: "ok",
      checks: {
        app: "ok",
        database: "ok"
      }
    }
  });

  assert.deepEqual(result, {
    ok: true,
    errors: []
  });
});

test("health URL monitor masks sensitive URL values before logging", () => {
  const safe = sanitizeUrlForLog("https://user:pass@example.com/api/health?token=abc&x=1");

  assert.doesNotMatch(safe, /pass|abc/);
  assert.match(safe, /token=\*\*\*/);
});

test("health URL monitor builds safe health evidence", () => {
  const evidence = buildHealthEvidence({
    url: "https://erp.example.com/api/health",
    result: {
      statusCode: 200,
      body: {
        ok: true,
        status: "ok",
        checks: {
          app: "ok",
          database: "ok"
        }
      }
    },
    evaluation: {
      ok: true,
      errors: []
    },
    checkedAt: "2026-06-21T12:00:00.000Z"
  });

  assert.deepEqual(evidence, {
    schemaVersion: 1,
    type: "healthcheck",
    checkedAt: "2026-06-21T12:00:00.000Z",
    url: "https://erp.example.com/api/health",
    statusCode: 200,
    ok: true,
    status: "ok",
    app: "ok",
    database: "ok",
    errorCount: 0,
    result: "PASS"
  });
});

test("health URL monitor validates recent evidence file", () => {
  const dir = mkdtempSync(path.join(tmpdir(), "erp-health-evidence-"));
  const evidencePath = path.join(dir, "health-latest.json");
  const evidence = buildHealthEvidence({
    url: "https://erp.example.com/api/health",
    result: {
      statusCode: 200,
      body: {
        ok: true,
        status: "ok",
        checks: {
          app: "ok",
          database: "ok"
        }
      }
    },
    evaluation: {
      ok: true,
      errors: []
    },
    checkedAt: "2026-06-21T12:00:00.000Z"
  });

  writeFileSync(evidencePath, JSON.stringify(evidence), "utf8");

  const report = checkHealthEvidenceFile({
    evidencePath,
    now: new Date("2026-06-21T12:20:00.000Z"),
    maxAgeMinutes: 30
  });

  assert.equal(report.ok, true);
  assert.deepEqual(report.errors, []);
});

test("health URL monitor rejects expired or degraded evidence", () => {
  const errors = validateHealthEvidence({
    schemaVersion: 1,
    type: "healthcheck",
    checkedAt: "2026-06-21T11:00:00.000Z",
    url: "https://erp.example.com/api/health",
    statusCode: 503,
    ok: false,
    status: "degraded",
    app: "ok",
    database: "degraded",
    errorCount: 2,
    result: "FAIL"
  }, {
    now: new Date("2026-06-21T12:00:00.000Z"),
    maxAgeMinutes: 30
  });

  assert.match(errors.join("\n"), /healthcheck vencido/);
  assert.match(errors.join("\n"), /database/);
  assert.match(errors.join("\n"), /statusCode/);
});

test("health URL monitor rejects evidence with secret-like values", () => {
  const errors = validateHealthEvidence({
    schemaVersion: 1,
    type: "healthcheck",
    checkedAt: "2026-06-21T12:00:00.000Z",
    url: "https://erp.example.com/api/health?token=abc",
    statusCode: 200,
    ok: true,
    status: "ok",
    app: "ok",
    database: "ok",
    errorCount: 0,
    result: "PASS"
  }, {
    now: new Date("2026-06-21T12:01:00.000Z")
  });

  assert.match(errors.join("\n"), /segredos/);
});
