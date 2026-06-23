import test from "node:test";
import assert from "node:assert/strict";
import { mkdirSync, mkdtempSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import { collectMigrationGuardErrors } from "../scripts/check-prisma-migrations.mjs";

function createProjectFixture() {
  const cwd = mkdtempSync(path.join(tmpdir(), "precast-migration-guard-"));
  const migrationDir = path.join(cwd, "prisma", "migrations", "20260615000000_baseline");

  mkdirSync(migrationDir, { recursive: true });
  writeFileSync(path.join(cwd, "prisma", "schema.prisma"), "datasource db { provider = \"postgresql\" url = env(\"DATABASE_URL\") }\n", "utf8");
  writeFileSync(path.join(cwd, "prisma", "migrations", "migration_lock.toml"), "provider = \"postgresql\"\n", "utf8");
  writeFileSync(
    path.join(migrationDir, "migration.sql"),
    "CREATE TABLE \"User\" (\"id\" TEXT NOT NULL, CONSTRAINT \"User_pkey\" PRIMARY KEY (\"id\"));\n",
    "utf8"
  );
  writeFileSync(path.join(cwd, "package.json"), "{\"scripts\":{\"db:migrate\":\"prisma migrate dev\"}}\n", "utf8");

  return cwd;
}

test("migration guard accepts versioned Prisma migrations", () => {
  const cwd = createProjectFixture();
  const result = collectMigrationGuardErrors({ cwd, env: { ...process.env, SHADOW_DATABASE_URL: "" } });

  assert.deepEqual(result.errors, []);
  assert.match(result.warnings.join("\n"), /SHADOW_DATABASE_URL/);
});

test("migration guard blocks automated prisma db push", () => {
  const cwd = createProjectFixture();
  writeFileSync(path.join(cwd, "package.json"), "{\"scripts\":{\"deploy\":\"prisma db push\"}}\n", "utf8");

  const result = collectMigrationGuardErrors({ cwd, env: { ...process.env, SHADOW_DATABASE_URL: "" } });

  assert.match(result.errors.join("\n"), /prisma db push/);
});
