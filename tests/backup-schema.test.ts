import test from "node:test";
import assert from "node:assert/strict";
import { resolveBackupSchema } from "../scripts/backup/backup-schema.mjs";
import { buildPgDumpArgs } from "../scripts/backup/backup-full-postgres-local.mjs";
import { buildPgRestoreArgs } from "../scripts/backup/restore-drill-local.mjs";

test("backup schema defaults to public and rejects unsafe values", () => {
  assert.equal(resolveBackupSchema(undefined), "public");
  assert.equal(resolveBackupSchema("erp_data"), "erp_data");
  assert.throws(() => resolveBackupSchema("public; drop schema public"), /invalido/i);
  assert.throws(() => resolveBackupSchema("public.*"), /invalido/i);
});

test("full backup limits pg_dump to the application schema", () => {
  const args = buildPgDumpArgs({
    databaseUrl: "postgresql://backup:secret@db.example:5432/postgres",
    dumpPath: "/var/backups/precast-erp/full/backup.dump",
    schema: "public"
  });

  assert.deepEqual(args.slice(0, 4), [
    "--dbname",
    "postgresql://backup:secret@db.example:5432/postgres",
    "--schema",
    "public"
  ]);
  assert.ok(args.includes("--no-owner"));
  assert.ok(args.includes("--no-privileges"));
});

test("restore drill limits pg_restore to the application schema", () => {
  const args = buildPgRestoreArgs({
    restoreUrl: "postgresql://restore:secret@db.example:5432/precast_restore_drill",
    dumpPath: "/var/backups/precast-erp/full/backup.dump",
    schema: "public"
  });

  assert.deepEqual(args.slice(0, 4), [
    "--dbname",
    "postgresql://restore:secret@db.example:5432/precast_restore_drill",
    "--schema",
    "public"
  ]);
  assert.ok(args.includes("--clean"));
  assert.ok(args.includes("--if-exists"));
});
