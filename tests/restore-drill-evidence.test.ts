import test from "node:test";
import assert from "node:assert/strict";
import { mkdirSync, mkdtempSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import {
  checkRestoreDrillEvidenceFile,
  validateRestoreDrillEvidence
} from "../scripts/backup/check-restore-drill-evidence.mjs";

const now = new Date("2026-06-18T12:00:00.000Z");

function validEvidence(overrides: Record<string, unknown> = {}) {
  return {
    schemaVersion: 1,
    performedAt: "2026-06-17T20:00:00.000Z",
    operator: "Administrador ERP",
    sourceBackup: "s3://precast-backups/precast-erp/postgres/full/2026/06/17/precast-erp-full.dump",
    restoreTarget: "precast_erp_restore_drill",
    checksumVerified: true,
    userTableVerified: true,
    publicTableCount: 42,
    result: "PASS",
    notes: "Restore validado em banco temporario.",
    ...overrides
  };
}

test("restore drill evidence accepts recent successful restore metadata", () => {
  const errors = validateRestoreDrillEvidence(validEvidence(), { now, maxAgeDays: 45 });

  assert.deepEqual(errors, []);
});

test("restore drill evidence rejects missing evidence file", () => {
  const cwd = mkdtempSync(path.join(tmpdir(), "precast-restore-evidence-"));
  const report = checkRestoreDrillEvidenceFile({
    evidencePath: path.join(cwd, "missing.json"),
    now,
    maxAgeDays: 45
  });

  assert.equal(report.ok, false);
  assert.match(report.errors.join("\n"), /ausente/);
});

test("restore drill evidence rejects expired restore drill", () => {
  const errors = validateRestoreDrillEvidence(
    validEvidence({ performedAt: "2026-04-01T20:00:00.000Z" }),
    { now, maxAgeDays: 45 }
  );

  assert.match(errors.join("\n"), /vencido/);
});

test("restore drill evidence rejects credential leaks", () => {
  const errors = validateRestoreDrillEvidence(
    validEvidence({
      restoreTarget: "postgresql://user:secret@db.example.com:5432/precast_erp_restore_drill"
    }),
    { now, maxAgeDays: 45 }
  );

  assert.match(errors.join("\n"), /segredos/);
});

test("restore drill evidence file parser accepts valid JSON evidence", () => {
  const cwd = mkdtempSync(path.join(tmpdir(), "precast-restore-evidence-"));
  const evidencePath = path.join(cwd, "latest.json");
  mkdirSync(path.dirname(evidencePath), { recursive: true });
  writeFileSync(evidencePath, JSON.stringify(validEvidence(), null, 2), "utf8");

  const report = checkRestoreDrillEvidenceFile({ evidencePath, now, maxAgeDays: 45 });

  assert.equal(report.ok, true);
  assert.deepEqual(report.errors, []);
});
