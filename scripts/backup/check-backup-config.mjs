import { spawnSync } from "node:child_process";
import { pathToFileURL } from "node:url";
import { existsSync } from "node:fs";
import { loadDotEnv, resolveBackupEnvFile } from "./backup-env.mjs";
import { resolveBackupSchema } from "./backup-schema.mjs";
import { resolveBackupRetentionDays } from "./local-backup-retention.mjs";

function getArg(name, fallback = undefined) {
  const args = process.argv.slice(2);
  const index = args.indexOf(name);
  if (index === -1) return fallback;
  return args[index + 1] || fallback;
}

function safeUrlSummary(value) {
  try {
    const url = new URL(value);
    const database = url.pathname.replace(/^\/+/, "") || "-";
    return `${url.protocol}//${url.hostname}:${url.port || "default"}/${database}`;
  } catch {
    return "URL invalida";
  }
}

function commandAvailable(command) {
  const result = spawnSync(command, ["--version"], {
    encoding: "utf8",
    shell: false,
    stdio: "ignore"
  });
  return !result.error && result.status === 0;
}

const requiredBaseEnv = ["BACKUP_DATABASE_URL"];

const requiredS3Env = [
  "BACKUP_S3_BUCKET",
  "BACKUP_S3_PREFIX",
  "AWS_REGION",
  "AWS_ACCESS_KEY_ID",
  "AWS_SECRET_ACCESS_KEY"
];

const baseRequiredTools = ["pg_dump", "pg_restore", "psql"];
const s3RequiredTools = ["aws"];

function addCheck(checks, errors, name, ok, detail) {
  checks.push({ name, ok, detail });
  if (!ok) errors.push(`${name}: ${detail}`);
}

function addWarning(warnings, message) {
  warnings.push(message);
}

function hasBackupEnvironmentVariables() {
  return [
    "BACKUP_STORAGE_MODE",
    "BACKUP_DATABASE_URL",
    "BACKUP_DATABASE_SCHEMA",
    "BACKUP_LOCAL_DIR",
    "BACKUP_RETENTION_DAYS",
    "BACKUP_S3_BUCKET",
    "BACKUP_S3_PREFIX",
    "AWS_REGION",
    "AWS_ACCESS_KEY_ID",
    "AWS_SECRET_ACCESS_KEY",
    "RESTORE_DATABASE_URL"
  ].some((name) => Boolean(process.env[name]));
}

function isPlaceholderValue(value) {
  if (typeof value !== "string") return true;
  const normalized = value.trim().replace(/^['"]|['"]$/g, "").toLowerCase();
  if (!normalized) return true;

  return [
    "...",
    "preencher",
    "preencher_no_servidor",
    "troque",
    "change-me",
    "changeme",
    "example",
    "nome-do-bucket",
    "seu-bucket",
    "usuario:senha",
    "user:password",
    "@host:",
    "project_ref"
  ].some((placeholder) => normalized.includes(placeholder));
}

export function checkBackupConfig({
  envFile = resolveBackupEnvFile(),
  skipTools = false
} = {}) {
  const errors = [];
  const warnings = [];
  const checks = [];

  const envFileLoaded = loadDotEnv(envFile);
  addCheck(
    checks,
    errors,
    "arquivo/config backup",
    envFileLoaded || hasBackupEnvironmentVariables(),
    envFileLoaded
      ? `carregado de ${envFile}`
      : existsSync(envFile)
        ? "arquivo existe, mas nao trouxe variaveis reconhecidas"
        : `arquivo nao encontrado em ${envFile}`
  );

  const hasS3Config = requiredS3Env.some((name) => Boolean(process.env[name]));
  const storageMode = (process.env.BACKUP_STORAGE_MODE || (hasS3Config ? "s3" : "local")).trim().toLowerCase();
  const isLocalMode = storageMode === "local";
  const isS3Mode = storageMode === "s3";

  addCheck(
    checks,
    errors,
    "BACKUP_STORAGE_MODE",
    isLocalMode || isS3Mode,
    isLocalMode || isS3Mode ? storageMode : "use local ou s3"
  );

  const requiredEnv = isLocalMode ? requiredBaseEnv : [...requiredBaseEnv, ...requiredS3Env];

  for (const name of requiredEnv) {
    const value = process.env[name];
    const configured = Boolean(value) && !isPlaceholderValue(value);
    addCheck(
      checks,
      errors,
      name,
      configured,
      configured ? "configurada" : value ? "placeholder ou valor invalido" : "ausente"
    );
  }

  const publicSecrets = Object.keys(process.env).filter((key) =>
    key.startsWith("NEXT_PUBLIC_") &&
    /(BACKUP|AWS|S3|DATABASE|DIRECT|RESTORE|SECRET|TOKEN|KEY)/i.test(key)
  );
  addCheck(
    checks,
    errors,
    "variaveis publicas sensiveis",
    publicSecrets.length === 0,
    publicSecrets.length === 0 ? "nenhuma encontrada" : publicSecrets.join(", ")
  );

  const backupUrl = process.env.BACKUP_DATABASE_URL;
  if (backupUrl) {
    addCheck(
      checks,
      errors,
      "BACKUP_DATABASE_URL valida",
      safeUrlSummary(backupUrl) !== "URL invalida",
      safeUrlSummary(backupUrl)
    );
  }

  try {
    addCheck(
      checks,
      errors,
      "BACKUP_DATABASE_SCHEMA",
      true,
      resolveBackupSchema()
    );
  } catch (error) {
    addCheck(
      checks,
      errors,
      "BACKUP_DATABASE_SCHEMA",
      false,
      error instanceof Error ? error.message : "schema invalido"
    );
  }

  const restoreUrl = process.env.RESTORE_DATABASE_URL;
  if (restoreUrl) {
    const restoreConfigured = !isPlaceholderValue(restoreUrl);
    addCheck(
      checks,
      errors,
      "RESTORE_DATABASE_URL configurada",
      restoreConfigured,
      restoreConfigured ? "configurada" : "placeholder ou valor invalido"
    );
    addCheck(
      checks,
      errors,
      "RESTORE_DATABASE_URL valida",
      safeUrlSummary(restoreUrl) !== "URL invalida",
      safeUrlSummary(restoreUrl)
    );
    addCheck(
      checks,
      errors,
      "RESTORE_DATABASE_URL isolada",
      restoreUrl !== backupUrl && restoreUrl !== process.env.DATABASE_URL && restoreUrl !== process.env.DIRECT_URL,
      restoreUrl === backupUrl || restoreUrl === process.env.DATABASE_URL || restoreUrl === process.env.DIRECT_URL
        ? "destino de restore nao pode ser banco real"
        : "destino diferente do banco real"
    );

    const restoreLooksSafe = /(restore|drill|teste|test|tmp|temp|ci)/i.test(restoreUrl);
    addCheck(
      checks,
      errors,
      "RESTORE_DATABASE_URL parece ambiente de teste",
      restoreLooksSafe,
      restoreLooksSafe ? "nome seguro para restore drill" : "inclua restore, drill, teste, test, tmp, temp ou ci no nome"
    );
  } else {
    addWarning(warnings, "RESTORE_DATABASE_URL ausente. Configure antes do teste mensal de restauracao.");
  }

  if (isLocalMode) {
    const localDir = process.env.BACKUP_LOCAL_DIR || "";
    const configured = Boolean(localDir) && !isPlaceholderValue(localDir);
    addCheck(
      checks,
      errors,
      "BACKUP_LOCAL_DIR",
      configured,
      configured ? "destino local configurado" : localDir ? "placeholder ou valor invalido" : "ausente"
    );

    if (configured) {
      addCheck(
        checks,
        errors,
        "BACKUP_LOCAL_DIR fora do repositorio",
        !localDir.includes("erp-pre-moldados-prototype") && !localDir.includes("Documents\\New project"),
        !localDir.includes("erp-pre-moldados-prototype") && !localDir.includes("Documents\\New project")
          ? "fora do checkout do projeto"
          : "use caminho externo ao checkout do projeto"
      );
    }

    try {
      const retentionDays = resolveBackupRetentionDays(process.env.BACKUP_RETENTION_DAYS);
      if (retentionDays) {
        addCheck(
          checks,
          errors,
          "BACKUP_RETENTION_DAYS",
          true,
          `${retentionDays} dia(s)`
        );
      } else {
        addWarning(warnings, "BACKUP_RETENTION_DAYS ausente. Backups locais antigos nao serao removidos.");
      }
    } catch (error) {
      addCheck(
        checks,
        errors,
        "BACKUP_RETENTION_DAYS",
        false,
        error instanceof Error ? error.message : "retencao invalida"
      );
    }

    addWarning(warnings, "Modo local exige que a pasta seja copiada por backup externo da empresa.");
  } else {
    const bucket = process.env.BACKUP_S3_BUCKET || "";
    addCheck(
      checks,
      errors,
      "BACKUP_S3_BUCKET formato",
      Boolean(bucket) && !bucket.includes("/") && !bucket.startsWith("s3://"),
      bucket ? "bucket sem barra ou prefixo s3://" : "bucket ausente"
    );

    const prefix = process.env.BACKUP_S3_PREFIX || "";
    addCheck(
      checks,
      errors,
      "BACKUP_S3_PREFIX formato",
      Boolean(prefix) && !prefix.startsWith("/") && !prefix.includes(".."),
      prefix ? "prefixo relativo seguro" : "prefixo ausente"
    );

    if (process.env.BACKUP_S3_KMS_KEY_ID) {
      addCheck(checks, errors, "BACKUP_S3_KMS_KEY_ID", true, "KMS configurado");
    } else {
      addWarning(warnings, "BACKUP_S3_KMS_KEY_ID ausente. O script usa SSE-S3 AES256 como fallback.");
    }
  }

  if (skipTools) {
    addWarning(warnings, "Checagem de ferramentas pulada por --skip-tools.");
  } else {
    const requiredTools = isS3Mode ? [...baseRequiredTools, ...s3RequiredTools] : baseRequiredTools;
    for (const tool of requiredTools) {
      const available = commandAvailable(tool);
      addCheck(
        checks,
        errors,
        `ferramenta ${tool}`,
        available,
        available ? "encontrada no PATH" : "nao encontrada no PATH"
      );
    }
  }

  return {
    ok: errors.length === 0,
    envFile,
    storageMode,
    backupDatabase: backupUrl ? safeUrlSummary(backupUrl) : null,
    restoreDatabase: restoreUrl ? safeUrlSummary(restoreUrl) : null,
    checks,
    warnings,
    errors
  };
}

function main() {
  const args = process.argv.slice(2);
  const envFile = resolveBackupEnvFile(getArg("--env-file"));
  const skipTools = args.includes("--skip-tools");
  const jsonOutput = args.includes("--json");
  const report = checkBackupConfig({ envFile, skipTools });

  if (jsonOutput) {
    console.log(JSON.stringify(report, null, 2));
  } else {
    console.log("Verificacao de backup");
    console.log(`Ambiente: ${envFile}`);
    if (report.backupDatabase) console.log(`Banco origem: ${report.backupDatabase}`);
    if (report.restoreDatabase) console.log(`Banco restore: ${report.restoreDatabase}`);

    for (const check of report.checks) {
      console.log(`${check.ok ? "OK" : "ERRO"} - ${check.name}: ${check.detail}`);
    }

    for (const warning of report.warnings) {
      console.log(`AVISO - ${warning}`);
    }
  }

  if (!report.ok) {
    process.exit(1);
  }
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  main();
}
