import test from "node:test";
import assert from "node:assert/strict";
import { mkdirSync, mkdtempSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import {
  checkBackupEvidenceFile,
  validateBackupEvidence
} from "../scripts/backup/check-backup-evidence.mjs";

const now = new Date("2026-06-18T12:00:00.000Z");

function validEvidence(overrides: Record<string, unknown> = {}) {
  return {
    schemaVersion: 1,
    performedAt: "2026-06-18T02:00:00.000Z",
    operator: "Administrador ERP",
    type: "full-logical-backup",
    destination: "s3://precast-backups/precast-erp/postgres/full/2026/06/18/precast-erp-full.dump",
    checksumUri: "s3://precast-backups/precast-erp/postgres/full/2026/06/18/precast-erp-full.sha256",
    checksumSha256: "a".repeat(64),
    sizeBytes: 1000,
    encryption: "AES256",
    result: "PASS",
    ...overrides
  };
}

test("backup evidence accepts recent full backup metadata", () => {
  const errors = validateBackupEvidence(validEvidence(), { now, maxAgeHours: 36 });

  assert.deepEqual(errors, []);
});

test("backup evidence rejects missing file", () => {
  const cwd = mkdtempSync(path.join(tmpdir(), "precast-backup-evidence-"));
  const report = checkBackupEvidenceFile({
    evidencePath: path.join(cwd, "missing.json"),
    now,
    maxAgeHours: 36
  });

  assert.equal(report.ok, false);
  assert.match(report.errors.join("\n"), /ausente/);
});

test("backup evidence rejects expired backup", () => {
  const errors = validateBackupEvidence(
    validEvidence({ performedAt: "2026-06-16T02:00:00.000Z" }),
    { now, maxAgeHours: 36 }
  );

  assert.match(errors.join("\n"), /vencido/);
});

test("backup evidence rejects credential leaks", () => {
  const errors = validateBackupEvidence(
    validEvidence({
      destination: "postgresql://user:secret@db.example.com:5432/postgres"
    }),
    { now, maxAgeHours: 36 }
  );

  assert.match(errors.join("\n"), /segredos/);
});

test("backup evidence file parser accepts valid JSON evidence", () => {
  const cwd = mkdtempSync(path.join(tmpdir(), "precast-backup-evidence-"));
  const evidencePath = path.join(cwd, "latest.json");
  mkdirSync(path.dirname(evidencePath), { recursive: true });
  writeFileSync(evidencePath, JSON.stringify(validEvidence(), null, 2), "utf8");

  const report = checkBackupEvidenceFile({ evidencePath, now, maxAgeHours: 36 });

  assert.equal(report.ok, true);
  assert.deepEqual(report.errors, []);
});
