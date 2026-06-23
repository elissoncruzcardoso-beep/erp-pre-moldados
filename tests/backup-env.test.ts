import test from "node:test";
import assert from "node:assert/strict";
import { mkdtempSync, writeFileSync } from "node:fs";
import os from "node:os";
import path from "node:path";
import {
  loadDotEnv,
  resolveBackupEnvFile,
  resolveEnvFilePath
} from "../scripts/backup/backup-env.mjs";
import { checkBackupConfig } from "../scripts/backup/check-backup-config.mjs";

function restoreEnv(key: string, value: string | undefined) {
  if (value === undefined) {
    delete process.env[key];
  } else {
    process.env[key] = value;
  }
}

const backupEnvKeys = [
  "BACKUP_DATABASE_URL",
  "BACKUP_S3_BUCKET",
  "BACKUP_S3_PREFIX",
  "AWS_REGION",
  "AWS_ACCESS_KEY_ID",
  "AWS_SECRET_ACCESS_KEY",
  "RESTORE_DATABASE_URL",
  "BACKUP_S3_KMS_KEY_ID"
];

test("backup env resolver prefers explicit value before environment pointer", () => {
  const previous = process.env.PRECAST_BACKUP_ENV_FILE;
  process.env.PRECAST_BACKUP_ENV_FILE = "C:/seguro/precast-backup.env";

  try {
    assert.equal(resolveBackupEnvFile("manual.env"), "manual.env");
    assert.equal(resolveBackupEnvFile(undefined, { fallback: "fallback.env" }), "C:/seguro/precast-backup.env");
  } finally {
    restoreEnv("PRECAST_BACKUP_ENV_FILE", previous);
  }
});

test("backup env resolver accepts legacy BACKUP_ENV_FILE pointer", () => {
  const previousPrecast = process.env.PRECAST_BACKUP_ENV_FILE;
  const previousBackup = process.env.BACKUP_ENV_FILE;
  delete process.env.PRECAST_BACKUP_ENV_FILE;
  process.env.BACKUP_ENV_FILE = "D:/seguro/precast-backup.env";

  try {
    assert.equal(resolveBackupEnvFile(undefined, { fallback: "fallback.env" }), "D:/seguro/precast-backup.env");
  } finally {
    restoreEnv("PRECAST_BACKUP_ENV_FILE", previousPrecast);
    restoreEnv("BACKUP_ENV_FILE", previousBackup);
  }
});

test("backup env loader reads external file without overwriting existing env", () => {
  const cwd = mkdtempSync(path.join(os.tmpdir(), "precast-backup-env-"));
  const envPath = path.join(cwd, "precast-backup.env");
  const previousBucket = process.env.BACKUP_S3_BUCKET;
  const previousRegion = process.env.AWS_REGION;

  process.env.BACKUP_S3_BUCKET = "already-set";
  delete process.env.AWS_REGION;

  writeFileSync(envPath, [
    "BACKUP_S3_BUCKET=from-file",
    "AWS_REGION=sa-east-1"
  ].join("\n"));

  try {
    assert.equal(loadDotEnv(envPath), true);
    assert.equal(process.env.BACKUP_S3_BUCKET, "already-set");
    assert.equal(process.env.AWS_REGION, "sa-east-1");
  } finally {
    restoreEnv("BACKUP_S3_BUCKET", previousBucket);
    restoreEnv("AWS_REGION", previousRegion);
  }
});

test("backup env path resolver keeps absolute paths and resolves relative paths", () => {
  assert.equal(resolveEnvFilePath("C:/seguro/precast-backup.env"), "C:/seguro/precast-backup.env");
  assert.equal(
    resolveEnvFilePath("config/precast-backup.env", { root: "C:/erp" }).replace(/\\/g, "/"),
    "C:/erp/config/precast-backup.env"
  );
});

test("backup config rejects template placeholder values", () => {
  const cwd = mkdtempSync(path.join(os.tmpdir(), "precast-backup-placeholder-"));
  const envPath = path.join(cwd, "precast-backup.env");
  const previousValues = new Map(backupEnvKeys.map((key) => [key, process.env[key]]));

  for (const key of backupEnvKeys) {
    delete process.env[key];
  }

  writeFileSync(envPath, [
    "BACKUP_DATABASE_URL=postgresql://USUARIO:SENHA@HOST:5432/postgres",
    "BACKUP_S3_BUCKET=nome-do-bucket-privado",
    "BACKUP_S3_PREFIX=precast-erp/postgres",
    "AWS_REGION=sa-east-1",
    "AWS_ACCESS_KEY_ID=PREENCHER_NO_SERVIDOR",
    "AWS_SECRET_ACCESS_KEY=PREENCHER_NO_SERVIDOR"
  ].join("\n"));

  try {
    const report = checkBackupConfig({ envFile: envPath, skipTools: true });
    assert.equal(report.ok, false);
    assert.match(report.errors.join("\n"), /placeholder/);
    assert.match(report.errors.join("\n"), /BACKUP_DATABASE_URL/);
    assert.match(report.errors.join("\n"), /AWS_SECRET_ACCESS_KEY/);
  } finally {
    for (const [key, value] of previousValues) {
      restoreEnv(key, value);
    }
  }
});
