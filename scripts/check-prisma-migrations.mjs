import { existsSync, readdirSync, readFileSync } from "node:fs";
import path from "node:path";
import { spawnSync } from "node:child_process";
import { pathToFileURL } from "node:url";

const root = process.cwd();
const migrationsDir = path.join(root, "prisma", "migrations");
const schemaPath = path.join(root, "prisma", "schema.prisma");

const dbPushScanFiles = [
  "package.json",
  ".github/workflows/ci.yml",
  "vercel.json"
];

export function collectMigrationGuardErrors({ cwd = root, env = process.env } = {}) {
  const errors = [];
  const warnings = [];
  const baseMigrationsDir = path.join(cwd, "prisma", "migrations");
  const baseSchemaPath = path.join(cwd, "prisma", "schema.prisma");

  if (!existsSync(baseSchemaPath)) {
    errors.push("prisma/schema.prisma ausente.");
  }

  if (!existsSync(baseMigrationsDir)) {
    errors.push("prisma/migrations ausente.");
    return { errors, warnings };
  }

  const migrationLock = path.join(baseMigrationsDir, "migration_lock.toml");
  if (!existsSync(migrationLock)) {
    errors.push("prisma/migrations/migration_lock.toml ausente.");
  }

  const migrationDirs = readdirSync(baseMigrationsDir, { withFileTypes: true })
    .filter((entry) => entry.isDirectory())
    .map((entry) => entry.name)
    .sort();

  if (migrationDirs.length === 0) {
    errors.push("Nenhuma migration versionada encontrada em prisma/migrations.");
  }

  for (const dir of migrationDirs) {
    const migrationSql = path.join(baseMigrationsDir, dir, "migration.sql");
    if (!existsSync(migrationSql)) {
      errors.push(`Migration ${dir} sem migration.sql.`);
      continue;
    }

    const content = readFileSync(migrationSql, "utf8").trim();
    if (content.length < 50) {
      errors.push(`Migration ${dir} parece vazia ou incompleta.`);
    }
  }

  for (const relativeFile of dbPushScanFiles) {
    const file = path.join(cwd, relativeFile);
    if (!existsSync(file)) continue;

    const content = readFileSync(file, "utf8");
    if (/prisma\s+db\s+push|prisma\.cmd\s+db\s+push|npx\.cmd\s+prisma\s+db\s+push/i.test(content)) {
      errors.push(`${relativeFile} usa prisma db push. Use migrations versionadas fora de prototipos locais.`);
    }
  }

  if (!env.SHADOW_DATABASE_URL) {
    warnings.push("SHADOW_DATABASE_URL ausente. Diff migrations x schema nao foi executado.");
  }

  return { errors, warnings };
}

function runStrictDiff() {
  if (!process.env.SHADOW_DATABASE_URL) return { status: 0, stdout: "", stderr: "" };

  const result = spawnSync(
    process.platform === "win32" ? "npx.cmd" : "npx",
    [
      "prisma",
      "migrate",
      "diff",
      "--from-migrations",
      migrationsDir,
      "--to-schema-datamodel",
      schemaPath,
      "--shadow-database-url",
      process.env.SHADOW_DATABASE_URL,
      "--exit-code"
    ],
    {
      cwd: root,
      encoding: "utf8",
      shell: false
    }
  );

  return {
    status: result.status ?? 1,
    stdout: result.stdout || "",
    stderr: result.stderr || result.error?.message || ""
  };
}

function main() {
  const { errors, warnings } = collectMigrationGuardErrors();

  for (const warning of warnings) {
    console.warn(`AVISO - ${warning}`);
  }

  if (errors.length > 0) {
    console.error("Migrations Prisma inseguras:");
    for (const error of errors) {
      console.error(`- ${error}`);
    }
    process.exit(1);
  }

  const diff = runStrictDiff();
  if (diff.status === 2) {
    console.error("Schema Prisma diverge das migrations versionadas.");
    if (diff.stdout.trim()) console.error(diff.stdout.trim());
    process.exit(1);
  }

  if (diff.status !== 0) {
    console.error("Nao foi possivel validar o diff das migrations.");
    if (diff.stderr.trim()) console.error(diff.stderr.trim());
    process.exit(1);
  }

  console.log("OK: migrations Prisma presentes e sem db push automatizado.");
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  main();
}
