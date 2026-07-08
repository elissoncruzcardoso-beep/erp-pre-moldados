import test from "node:test";
import assert from "node:assert/strict";
import {
  assertRestoreTarget,
  buildRestoreDrillEvidence,
  getSafeRestoreTarget,
  parseChecksumValue
} from "../scripts/backup/restore-drill-local.mjs";
import { validateRestoreDrillEvidence } from "../scripts/backup/check-restore-drill-evidence.mjs";

test("local restore drill rejects the real source database as target", () => {
  const realUrl = "postgresql://backup:secret@db.precast.lan:5432/postgres";

  assert.throws(
    () => assertRestoreTarget(realUrl, [realUrl]),
    /banco real/
  );
});

test("local restore drill requires a safe temporary target name", () => {
  assert.throws(
    () => assertRestoreTarget("postgresql://backup:secret@db.precast.lan:5432/producao", []),
    /ambiente de teste/
  );

  assert.doesNotThrow(() =>
    assertRestoreTarget("postgresql://backup:secret@db.precast.lan:5432/precast_erp_restore_drill", [])
  );
});

test("local restore drill derives a safe database label without credentials", () => {
  assert.equal(
    getSafeRestoreTarget("postgresql://backup:secret@db.precast.lan:5432/precast_erp_restore_drill"),
    "precast_erp_restore_drill"
  );
});

test("local restore drill parses checksum files safely", () => {
  assert.equal(parseChecksumValue(`${"a".repeat(64)}  backup.dump\n`), "a".repeat(64));
  assert.throws(() => parseChecksumValue("not-a-checksum backup.dump"), /checksum invalido/i);
});

test("local restore drill builds valid evidence for local dump path", () => {
  const evidence = buildRestoreDrillEvidence({
    now: new Date("2026-07-08T14:00:00.000Z"),
    operator: "Administrador ERP",
    sourceBackup: "C:/precast-backups/full/2026/07/08/precast-erp-full.dump",
    restoreTarget: "precast_erp_restore_drill",
    checksumVerified: true,
    publicTableCount: 42
  });

  const errors = validateRestoreDrillEvidence(evidence, {
    now: new Date("2026-07-08T15:00:00.000Z"),
    maxAgeDays: 45
  });

  assert.deepEqual(errors, []);
});
