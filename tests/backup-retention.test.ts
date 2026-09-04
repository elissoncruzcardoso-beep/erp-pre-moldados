import test from "node:test";
import assert from "node:assert/strict";
import {
  existsSync,
  mkdirSync,
  mkdtempSync,
  rmSync,
  utimesSync,
  writeFileSync
} from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import {
  pruneExpiredLocalBackups,
  resolveBackupRetentionDays
} from "../scripts/backup/local-backup-retention.mjs";

test("backup retention accepts an explicit safe number of days", () => {
  assert.equal(resolveBackupRetentionDays(undefined), null);
  assert.equal(resolveBackupRetentionDays("30"), 30);
  assert.equal(resolveBackupRetentionDays(" 60 "), 60);
});

test("backup retention rejects unsafe values", () => {
  assert.throws(() => resolveBackupRetentionDays("0"), /entre 1 e 3650/i);
  assert.throws(() => resolveBackupRetentionDays("30.5"), /numero inteiro/i);
  assert.throws(() => resolveBackupRetentionDays("delete"), /numero inteiro/i);
  assert.throws(() => resolveBackupRetentionDays("3651"), /entre 1 e 3650/i);
});

test("local retention removes only expired backup files", (t) => {
  const outputDir = mkdtempSync(path.join(tmpdir(), "precast-retention-"));
  t.after(() => rmSync(outputDir, { recursive: true, force: true }));

  const backupDir = path.join(outputDir, "full", "2026", "09", "04");
  mkdirSync(backupDir, { recursive: true });

  const oldDump = path.join(backupDir, "old.dump");
  const oldChecksum = `${oldDump}.sha256`;
  const recentDump = path.join(backupDir, "recent.dump");
  const preservedDump = path.join(backupDir, "preserved.dump");
  const unrelatedFile = path.join(backupDir, "notes.txt");

  for (const filePath of [oldDump, oldChecksum, recentDump, preservedDump, unrelatedFile]) {
    writeFileSync(filePath, "test", "utf8");
  }

  const oldDate = new Date("2026-07-01T00:00:00.000Z");
  const recentDate = new Date("2026-08-25T00:00:00.000Z");
  for (const filePath of [oldDump, oldChecksum, preservedDump, unrelatedFile]) {
    utimesSync(filePath, oldDate, oldDate);
  }
  utimesSync(recentDump, recentDate, recentDate);

  const result = pruneExpiredLocalBackups({
    outputDir,
    retentionDays: 30,
    preservePaths: [preservedDump],
    now: new Date("2026-09-04T12:00:00.000Z")
  });

  assert.deepEqual(
    result.removedFiles.map((filePath) => path.basename(filePath)).sort(),
    ["old.dump", "old.dump.sha256"]
  );
  assert.equal(existsSync(oldDump), false);
  assert.equal(existsSync(oldChecksum), false);
  assert.equal(existsSync(recentDump), true);
  assert.equal(existsSync(preservedDump), true);
  assert.equal(existsSync(unrelatedFile), true);
});

test("local retention stays disabled without a configured period", () => {
  assert.deepEqual(
    pruneExpiredLocalBackups({ outputDir: "/unused", retentionDays: null }),
    { retentionDays: null, removedFiles: [] }
  );
});
