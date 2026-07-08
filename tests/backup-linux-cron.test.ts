import test from "node:test";
import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import {
  buildCronBlock,
  mergeManagedCronBlock
} from "../scripts/backup/install-linux-backup-cron.mjs";

const projectPath = "/opt/precast/erp-pre-moldados-prototype";
const envFile = "/etc/precast-erp/precast-backup.env";
const logDir = "/var/log/precast-erp";

test("Linux backup cron installer is dry-run by default", () => {
  const result = spawnSync(
    process.execPath,
    [
      "scripts/backup/install-linux-backup-cron.mjs",
      "--project-path",
      projectPath,
      "--backup-env-file",
      envFile,
      "--log-dir",
      logDir
    ],
    {
      cwd: process.cwd(),
      encoding: "utf8",
      shell: false
    }
  );

  assert.equal(result.status, 0);
  assert.match(result.stdout, /Modo dry-run/);
  assert.match(result.stdout, /backup:full:local/);
  assert.match(result.stdout, /backup:readiness/);
  assert.doesNotMatch(result.stdout, /postgresql:\/\/[^"'\s]+:[^@"'\s]+@/);
});

test("Linux backup cron block schedules local backup checks", () => {
  const block = buildCronBlock({ projectPath, envFile, logDir });

  assert.match(block, /# BEGIN PRECAST ERP BACKUP/);
  assert.match(block, /backup:check-config/);
  assert.match(block, /backup:full:local/);
  assert.match(block, /backup:check-evidence/);
  assert.match(block, /backup:readiness/);
  assert.doesNotMatch(block, /backup:check-s3/);
  assert.doesNotMatch(block, /AWS_SECRET_ACCESS_KEY/);
});

test("Linux backup cron block can include monthly restore drill by option", () => {
  const block = buildCronBlock({
    projectPath,
    envFile,
    logDir,
    includeRestoreDrill: true
  });

  assert.match(block, /backup:restore-drill:local/);
  assert.match(block, /backup:check-restore-drill/);
});

test("Linux backup cron installer rejects relative paths", () => {
  assert.throws(
    () => buildCronBlock({ projectPath: "erp-pre-moldados-prototype", envFile, logDir }),
    /projectPath precisa ser um caminho absoluto Linux/
  );

  assert.throws(
    () => buildCronBlock({ projectPath, envFile: ".env", logDir }),
    /envFile precisa ser um caminho absoluto Linux/
  );
});

test("Linux backup cron merge replaces existing managed block instead of duplicating", () => {
  const first = buildCronBlock({ projectPath, envFile, logDir });
  const next = buildCronBlock({
    projectPath: "/srv/precast/erp-pre-moldados-prototype",
    envFile,
    logDir
  });
  const existing = `MAILTO=admin@example.com\n\n${first}`;
  const merged = mergeManagedCronBlock(existing, next);

  assert.match(merged, /MAILTO=admin@example.com/);
  assert.match(merged, /\/srv\/precast\/erp-pre-moldados-prototype/);
  assert.doesNotMatch(merged, /\/opt\/precast\/erp-pre-moldados-prototype/);
  assert.equal((merged.match(/BEGIN PRECAST ERP BACKUP/g) || []).length, 1);
});
