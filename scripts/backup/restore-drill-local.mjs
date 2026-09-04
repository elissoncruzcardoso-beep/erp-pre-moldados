import { createHash } from "node:crypto";
import { createReadStream, existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import path from "node:path";
import { spawnSync } from "node:child_process";
import { pathToFileURL } from "node:url";
import { loadDotEnv, resolveBackupEnvFile, resolveEnvFilePath } from "./backup-env.mjs";
import { resolveBackupSchema } from "./backup-schema.mjs";

const root = process.cwd();
const defaultBackupEvidencePath = path.join(root, "docs", "security", "backups", "latest.json");
const defaultRestoreEvidencePath = path.join(root, "docs", "security", "restore-drills", "latest.json");

function getArg(args, name, fallback = undefined) {
  const index = args.indexOf(name);
  if (index === -1) return fallback;
  return args[index + 1] || fallback;
}

function hasFlag(args, name) {
  return args.includes(name);
}

function normalizePathForEvidence(filePath) {
  return filePath.replace(/\\/g, "/");
}

function readJson(filePath) {
  return JSON.parse(readFileSync(filePath, "utf8"));
}

function sha256File(filePath) {
  return new Promise((resolve, reject) => {
    const hash = createHash("sha256");
    const stream = createReadStream(filePath);

    stream.on("data", (chunk) => hash.update(chunk));
    stream.on("error", reject);
    stream.on("end", () => resolve(hash.digest("hex")));
  });
}

export function parseChecksumValue(content) {
  const value = String(content || "").trim().split(/\s+/, 1)[0]?.toLowerCase();
  if (!/^[a-f0-9]{64}$/.test(value || "")) {
    throw new Error("Arquivo de checksum invalido.");
  }

  return value;
}

export function getSafeRestoreTarget(restoreUrl) {
  try {
    const url = new URL(restoreUrl);
    return url.pathname.replace(/^\/+/, "") || url.hostname || "restore_drill_target";
  } catch {
    return "restore_drill_target";
  }
}

export function assertRestoreTarget(restoreUrl, sourceUrls = []) {
  if (!restoreUrl) {
    throw new Error("Configure RESTORE_DATABASE_URL ou use --target-database-url.");
  }

  for (const sourceUrl of sourceUrls.filter(Boolean)) {
    if (restoreUrl === sourceUrl) {
      throw new Error("RESTORE_DATABASE_URL aponta para o banco real. Use um banco temporario exclusivo para restore drill.");
    }
  }

  if (!/(restore|drill|teste|test|tmp|temp|ci)/i.test(restoreUrl) && process.env.ALLOW_RESTORE_TO_NON_DRILL_DB !== "true") {
    throw new Error("Banco de destino nao parece ambiente de teste. Inclua restore, drill, teste, test, tmp, temp ou ci no nome.");
  }
}

export function buildRestoreDrillEvidence({
  now = new Date(),
  operator,
  sourceBackup,
  restoreTarget,
  checksumVerified,
  publicTableCount
}) {
  return {
    schemaVersion: 1,
    performedAt: now.toISOString(),
    operator,
    sourceBackup: normalizePathForEvidence(sourceBackup),
    restoreTarget,
    checksumVerified,
    userTableVerified: true,
    publicTableCount,
    result: "PASS",
    notes: "Restore validado em banco temporario."
  };
}

function resolveFromLatestBackupEvidence(evidencePath) {
  if (!existsSync(evidencePath)) {
    return {};
  }

  const evidence = readJson(evidencePath);
  if (evidence.storageMode !== "local") {
    return {};
  }

  return {
    dumpPath: evidence.destination,
    checksumPath: evidence.checksumUri
  };
}

function run(command, args) {
  const result = spawnSync(command, args, {
    stdio: "inherit",
    shell: false
  });

  if (result.error) {
    throw result.error;
  }

  if (result.status !== 0) {
    throw new Error(`${command} falhou com status ${result.status ?? "desconhecido"}.`);
  }
}

function runCapture(command, args) {
  const result = spawnSync(command, args, {
    encoding: "utf8",
    shell: false
  });

  if (result.error) {
    throw result.error;
  }

  if (result.status !== 0) {
    throw new Error(`${command} falhou com status ${result.status ?? "desconhecido"}: ${result.stderr || result.stdout}`);
  }

  return String(result.stdout || "").trim();
}

export function buildPgRestoreArgs({ restoreUrl, dumpPath, schema = "public" }) {
  return [
    "--dbname",
    restoreUrl,
    "--schema",
    resolveBackupSchema(schema),
    "--clean",
    "--if-exists",
    "--no-owner",
    "--no-privileges",
    dumpPath
  ];
}

export async function runLocalRestoreDrill({
  envFile = resolveBackupEnvFile(),
  dumpPath,
  checksumPath,
  backupEvidencePath = defaultBackupEvidencePath,
  evidencePath = defaultRestoreEvidencePath,
  targetDatabaseUrl,
  operator,
  skipChecksum = false,
  now = new Date()
} = {}) {
  loadDotEnv(envFile);

  const fromEvidence = resolveFromLatestBackupEvidence(backupEvidencePath);
  const selectedDumpPath = dumpPath || fromEvidence.dumpPath;
  const selectedChecksumPath = checksumPath || fromEvidence.checksumPath;
  const restoreUrl = targetDatabaseUrl || process.env.RESTORE_DATABASE_URL;
  const databaseSchema = resolveBackupSchema();

  assertRestoreTarget(restoreUrl, [
    process.env.BACKUP_DATABASE_URL,
    process.env.DIRECT_URL,
    process.env.DATABASE_URL
  ]);

  if (!selectedDumpPath) {
    throw new Error("Informe --dump-path ou rode depois de um backup local com evidencia latest.json.");
  }

  const resolvedDumpPath = resolveEnvFilePath(selectedDumpPath, { root });
  const resolvedChecksumPath = selectedChecksumPath ? resolveEnvFilePath(selectedChecksumPath, { root }) : "";

  if (!existsSync(resolvedDumpPath)) {
    throw new Error(`Dump nao encontrado em ${resolvedDumpPath}.`);
  }

  if (!skipChecksum) {
    if (!resolvedChecksumPath || !existsSync(resolvedChecksumPath)) {
      throw new Error("Informe --checksum-path ou use --skip-checksum apenas em teste controlado.");
    }

    const expectedHash = parseChecksumValue(readFileSync(resolvedChecksumPath, "utf8"));
    const actualHash = await sha256File(resolvedDumpPath);

    if (expectedHash !== actualHash) {
      throw new Error(`Checksum invalido. Esperado ${expectedHash}, obtido ${actualHash}.`);
    }

    console.log(`Checksum validado: ${actualHash}`);
  }

  console.log("Iniciando restore drill em banco temporario...");
  run("pg_restore", buildPgRestoreArgs({
    restoreUrl,
    dumpPath: resolvedDumpPath,
    schema: databaseSchema
  }));

  const tableCountRaw = runCapture("psql", [
    restoreUrl,
    "-v",
    "ON_ERROR_STOP=1",
    "-Atc",
    `select count(*) from information_schema.tables where table_schema = '${databaseSchema}';`
  ]);

  const userTable = runCapture("psql", [
    restoreUrl,
    "-v",
    "ON_ERROR_STOP=1",
    "-Atc",
    `select to_regclass('${databaseSchema}.\"User\"') is not null;`
  ]);

  if (userTable.trim() !== "t") {
    throw new Error("Validacao do restore falhou: tabela User nao encontrada.");
  }

  const publicTableCount = Number.parseInt(tableCountRaw, 10);
  if (!Number.isInteger(publicTableCount) || publicTableCount < 1) {
    throw new Error("Validacao do restore falhou: contagem de tabelas invalida.");
  }

  const safeRestoreTarget = getSafeRestoreTarget(restoreUrl);
  const restoreOperator = operator || process.env.BACKUP_OPERATOR || process.env.USERNAME || process.env.USER || "Operador backup";
  const evidence = buildRestoreDrillEvidence({
    now,
    operator: restoreOperator,
    sourceBackup: resolvedDumpPath,
    restoreTarget: safeRestoreTarget,
    checksumVerified: !skipChecksum,
    publicTableCount
  });

  mkdirSync(path.dirname(evidencePath), { recursive: true });
  writeFileSync(evidencePath, `${JSON.stringify(evidence, null, 2)}\n`, "utf8");

  console.log("Restore drill concluido.");
  console.log(`Tabelas public restauradas: ${publicTableCount}`);
  console.log(`Banco de teste preservado para conferencias: ${safeRestoreTarget}`);
  console.log(`Evidencia segura gravada em: ${evidencePath}`);

  return {
    evidencePath,
    evidence
  };
}

async function main() {
  const args = process.argv.slice(2);
  const envFile = resolveBackupEnvFile(getArg(args, "--env-file"));
  const dumpPath = getArg(args, "--dump-path") || getArg(args, "--dump");
  const checksumPath = getArg(args, "--checksum-path") || getArg(args, "--checksum");
  const backupEvidencePath = path.resolve(root, getArg(args, "--backup-evidence", defaultBackupEvidencePath));
  const evidencePath = path.resolve(root, getArg(args, "--evidence", defaultRestoreEvidencePath));
  const targetDatabaseUrl = getArg(args, "--target-database-url");
  const operator = getArg(args, "--operator");
  const skipChecksum = hasFlag(args, "--skip-checksum");

  await runLocalRestoreDrill({
    envFile,
    dumpPath,
    checksumPath,
    backupEvidencePath,
    evidencePath,
    targetDatabaseUrl,
    operator,
    skipChecksum
  });
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  main().catch((error) => {
    console.error(`ERRO - ${error.message}`);
    process.exit(1);
  });
}
