import test from "node:test";
import assert from "node:assert/strict";
import {
  buildReadinessReport,
  collectSecretLeaks
} from "../scripts/backup/backup-readiness-report.mjs";

function validBackupConfig(overrides: Record<string, unknown> = {}) {
  return {
    ok: true,
    envFile: "C:/seguro/precast-backup.env",
    backupDatabase: "postgresql://db.example.com:5432/postgres",
    restoreDatabase: "postgresql://db.example.com:5432/precast_erp_restore_drill",
    checks: [{ name: "BACKUP_DATABASE_URL", ok: true, detail: "configurada" }],
    warnings: [],
    errors: [],
    ...overrides
  };
}

function validRestoreEvidence(overrides: Record<string, unknown> = {}) {
  return {
    ok: true,
    evidencePath: "docs/security/restore-drills/latest.json",
    evidence: {
      schemaVersion: 1,
      performedAt: "2026-06-17T20:00:00.000Z",
      operator: "Administrador ERP",
      sourceBackup: "s3://precast-backups/precast-erp/postgres/full/2026/06/17/precast-erp-full.dump",
      restoreTarget: "precast_erp_restore_drill",
      publicTableCount: 42,
      result: "PASS"
    },
    errors: [],
    ...overrides
  };
}

function validBackupEvidence(overrides: Record<string, unknown> = {}) {
  return {
    ok: true,
    evidencePath: "docs/security/backups/latest.json",
    evidence: {
      schemaVersion: 1,
      performedAt: "2026-06-18T02:00:00.000Z",
      operator: "Administrador ERP",
      type: "full-logical-backup",
      destination: "s3://precast-backups/precast-erp/postgres/full/2026/06/18/precast-erp-full.dump",
      checksumUri: "s3://precast-backups/precast-erp/postgres/full/2026/06/18/precast-erp-full.sha256",
      checksumSha256: "a".repeat(64),
      sizeBytes: 1000,
      encryption: "AES256",
      result: "PASS"
    },
    errors: [],
    ...overrides
  };
}

function validS3PostureEvidence(overrides: Record<string, unknown> = {}) {
  return {
    ok: true,
    evidencePath: "docs/security/backups/s3-posture-latest.json",
    evidence: {
      schemaVersion: 1,
      type: "s3-backup-posture",
      checkedAt: "2026-06-18T07:45:00.000Z",
      bucket: "precast-backups",
      region: "sa-east-1",
      publicAccessBlocked: true,
      encryptionAlgorithm: "aws:kms",
      versioningStatus: "Enabled",
      tlsPolicyEnforced: true,
      lifecycleRuleCount: 1,
      objectLockEnabled: false,
      warningCount: 1,
      result: "PASS"
    },
    errors: [],
    ...overrides
  };
}

test("backup readiness report marks the environment ready when backup and restore checks pass", () => {
  const report = buildReadinessReport({
    backupConfig: validBackupConfig(),
    backupEvidence: validBackupEvidence(),
    s3PostureEvidence: validS3PostureEvidence(),
    restoreEvidence: validRestoreEvidence(),
    generatedAt: "2026-06-18T12:00:00.000Z"
  });

  assert.equal(report.status, "PRONTO");
  assert.equal(report.ready, true);
  assert.deepEqual(report.blockers, []);
});

test("backup readiness report is partial when S3 posture evidence is missing", () => {
  const report = buildReadinessReport({
    backupConfig: validBackupConfig(),
    backupEvidence: validBackupEvidence(),
    s3PostureEvidence: {
      ok: false,
      evidencePath: "docs/security/backups/s3-posture-latest.json",
      errors: ["evidencia de postura S3 ausente"]
    },
    restoreEvidence: validRestoreEvidence(),
    generatedAt: "2026-06-18T12:00:00.000Z"
  });

  assert.equal(report.status, "PARCIAL");
  assert.equal(report.ready, false);
  assert.match(report.nextActions.join("\n"), /backup:check-s3/);
});

test("backup readiness report is blocked when external backup config is missing", () => {
  const report = buildReadinessReport({
    backupConfig: validBackupConfig({
      ok: false,
      errors: ["BACKUP_S3_BUCKET: ausente"]
    }),
    backupEvidence: validBackupEvidence(),
    restoreEvidence: validRestoreEvidence(),
    generatedAt: "2026-06-18T12:00:00.000Z"
  });

  assert.equal(report.status, "BLOQUEADO");
  assert.equal(report.ready, false);
  assert.match(report.nextActions.join("\n"), /variaveis de backup externo/);
});

test("backup readiness report is blocked when a child check returns no details", () => {
  const report = buildReadinessReport({
    backupConfig: { ok: false },
    backupEvidence: validBackupEvidence(),
    restoreEvidence: validRestoreEvidence(),
    generatedAt: "2026-06-18T12:00:00.000Z"
  });

  assert.equal(report.status, "BLOQUEADO");
  assert.match(report.blockers.join("\n"), /backup: checagem nao concluiu/);
});

test("backup readiness report is partial when config is ready but restore evidence is missing", () => {
  const report = buildReadinessReport({
    backupConfig: validBackupConfig(),
    backupEvidence: validBackupEvidence(),
    restoreEvidence: {
      ok: false,
      evidencePath: "docs/security/restore-drills/latest.json",
      errors: ["evidencia de restore drill ausente"]
    },
    generatedAt: "2026-06-18T12:00:00.000Z"
  });

  assert.equal(report.status, "PARCIAL");
  assert.equal(report.ready, false);
  assert.match(report.nextActions.join("\n"), /restore drill/);
});

test("backup readiness report is partial when full backup evidence is missing", () => {
  const report = buildReadinessReport({
    backupConfig: validBackupConfig(),
    backupEvidence: {
      ok: false,
      evidencePath: "docs/security/backups/latest.json",
      errors: ["evidencia de backup completo ausente"]
    },
    restoreEvidence: validRestoreEvidence(),
    generatedAt: "2026-06-18T12:00:00.000Z"
  });

  assert.equal(report.status, "PARCIAL");
  assert.equal(report.ready, false);
  assert.match(report.nextActions.join("\n"), /backup completo real/);
});

test("backup readiness report blocks if a generated report would leak secrets", () => {
  const report = buildReadinessReport({
    backupConfig: validBackupConfig({
      backupDatabase: "postgresql://user:password@db.example.com:5432/postgres"
    }),
    backupEvidence: validBackupEvidence(),
    restoreEvidence: validRestoreEvidence(),
    generatedAt: "2026-06-18T12:00:00.000Z"
  });

  assert.equal(report.status, "BLOQUEADO");
  assert.match(report.blockers.join("\n"), /valor sensivel/);
});

test("secret leak collector detects database URLs with credentials", () => {
  const leaks = collectSecretLeaks({
    nested: {
      url: "postgresql://user:password@db.example.com:5432/postgres"
    }
  });

  assert.deepEqual(leaks, ["nested.url"]);
});

test("secret leak collector allows secret variable names without values", () => {
  const leaks = collectSecretLeaks({
    error: "AWS_SECRET_ACCESS_KEY: ausente"
  });

  assert.deepEqual(leaks, []);
});
