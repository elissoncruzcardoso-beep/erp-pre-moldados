import { createHash } from "node:crypto";
import { createReadStream, existsSync, mkdirSync, statSync, writeFileSync } from "node:fs";
import path from "node:path";
import { spawnSync } from "node:child_process";
import { pathToFileURL } from "node:url";
import { loadDotEnv, resolveBackupEnvFile, resolveEnvFilePath } from "./backup-env.mjs";

const root = process.cwd();
const defaultEvidencePath = path.join(root, "docs", "security", "backups", "latest.json");

function getArg(args, name, fallback = undefined) {
  const index = args.indexOf(name);
  if (index === -1) return fallback;
  return args[index + 1] || fallback;
}

function getDateParts(date) {
  const iso = date.toISOString();
  return {
    yyyy: iso.slice(0, 4),
    mm: iso.slice(5, 7),
    dd: iso.slice(8, 10),
    stamp: iso.replace(/[:.]/g, "-")
  };
}

function normalizePathForEvidence(filePath) {
  return filePath.replace(/\\/g, "/");
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

function assertOutsideRepo(outputDir) {
  const normalizedRepo = root.replace(/\\/g, "/").toLowerCase();
  const normalizedOutput = outputDir.replace(/\\/g, "/").toLowerCase();

  if (normalizedOutput.startsWith(normalizedRepo)) {
    throw new Error("BACKUP_LOCAL_DIR precisa ficar fora do checkout do projeto.");
  }
}

export async function runLocalFullBackup({
  envFile = resolveBackupEnvFile(),
  outputDir,
  evidencePath = defaultEvidencePath,
  operator,
  now = new Date()
} = {}) {
  loadDotEnv(envFile);

  const databaseUrl = process.env.BACKUP_DATABASE_URL;
  const configuredOutputDir = outputDir || process.env.BACKUP_LOCAL_DIR;
  const backupOperator = operator || process.env.BACKUP_OPERATOR || process.env.CRON_USER_EMAIL || "Administrador ERP";

  if (!databaseUrl) {
    throw new Error("Defina BACKUP_DATABASE_URL no arquivo externo de backup.");
  }

  if (!configuredOutputDir) {
    throw new Error("Defina BACKUP_LOCAL_DIR ou use --output-dir.");
  }

  const resolvedOutputDir = resolveEnvFilePath(configuredOutputDir, { root });
  assertOutsideRepo(resolvedOutputDir);

  const { yyyy, mm, dd, stamp } = getDateParts(now);
  const backupDir = path.join(resolvedOutputDir, "full", yyyy, mm, dd);
  mkdirSync(backupDir, { recursive: true });

  const dumpPath = path.join(backupDir, `precast-erp-full-${stamp}.dump`);
  const checksumPath = `${dumpPath}.sha256`;

  const dumpResult = spawnSync("pg_dump", [
    "--dbname",
    databaseUrl,
    "--format",
    "custom",
    "--compress",
    "9",
    "--no-owner",
    "--no-privileges",
    "--file",
    dumpPath
  ], {
    stdio: "inherit",
    shell: false
  });

  if (dumpResult.error) {
    throw dumpResult.error;
  }

  if (dumpResult.status !== 0 || !existsSync(dumpPath)) {
    throw new Error(`pg_dump falhou com status ${dumpResult.status ?? "desconhecido"}.`);
  }

  const checksum = await sha256File(dumpPath);
  writeFileSync(checksumPath, `${checksum}  ${path.basename(dumpPath)}\n`, "utf8");

  const evidence = {
    schemaVersion: 1,
    performedAt: now.toISOString(),
    type: "full-logical-backup",
    storageMode: "local",
    operator: backupOperator,
    destination: normalizePathForEvidence(dumpPath),
    checksumUri: normalizePathForEvidence(checksumPath),
    checksumSha256: checksum,
    sizeBytes: statSync(dumpPath).size,
    encryption: "local-managed",
    result: "PASS"
  };

  mkdirSync(path.dirname(evidencePath), { recursive: true });
  writeFileSync(evidencePath, `${JSON.stringify(evidence, null, 2)}\n`, "utf8");

  return {
    dumpPath,
    checksumPath,
    evidencePath,
    evidence
  };
}

async function main() {
  const args = process.argv.slice(2);
  const envFile = resolveBackupEnvFile(getArg(args, "--env-file"));
  const outputDir = getArg(args, "--output-dir");
  const evidencePath = path.resolve(root, getArg(args, "--evidence", defaultEvidencePath));
  const operator = getArg(args, "--operator");

  const result = await runLocalFullBackup({ envFile, outputDir, evidencePath, operator });

  console.log("Backup local concluido");
  console.log(`Dump: ${result.dumpPath}`);
  console.log(`Checksum: ${result.checksumPath}`);
  console.log(`Evidencia: ${result.evidencePath}`);
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  main().catch((error) => {
    console.error(`ERRO - ${error.message}`);
    process.exit(1);
  });
}
