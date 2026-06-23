import { spawnSync } from "node:child_process";
import { existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import path from "node:path";
import { pathToFileURL } from "node:url";
import { loadDotEnv, resolveBackupEnvFile } from "./backup-env.mjs";

const root = process.cwd();
const defaultEvidencePath = path.join(root, "docs", "security", "backups", "s3-posture-latest.json");
const defaultMaxAgeHours = 168;

function getArg(name, fallback = undefined) {
  const args = process.argv.slice(2);
  const index = args.indexOf(name);
  if (index === -1) return fallback;
  return args[index + 1] || fallback;
}

function commandAvailable(command) {
  const result = spawnSync(command, ["--version"], {
    encoding: "utf8",
    shell: false,
    stdio: "ignore"
  });
  return !result.error && result.status === 0;
}

function normalizeArray(value) {
  if (!value) return [];
  return Array.isArray(value) ? value : [value];
}

function addCheck(checks, errors, name, ok, detail) {
  checks.push({ name, ok, detail });
  if (!ok) errors.push(`${name}: ${detail}`);
}

function addWarning(warnings, message) {
  warnings.push(message);
}

function hasSecretLikeValue(value) {
  if (typeof value !== "string") return false;
  if (/postgres(ql)?:\/\/[^/\s]+:[^@\s]+@/i.test(value)) return true;
  if (/(AWS_SECRET_ACCESS_KEY|AWS_ACCESS_KEY_ID|AUTH_SECRET|TOKEN|PASSWORD|SENHA|SECRET=|DATABASE_URL=)/i.test(value)) return true;
  return false;
}

function collectSecretLeaks(value, pathParts = []) {
  const leaks = [];

  if (Array.isArray(value)) {
    for (const [index, item] of value.entries()) {
      leaks.push(...collectSecretLeaks(item, [...pathParts, String(index)]));
    }
    return leaks;
  }

  if (value && typeof value === "object") {
    for (const [key, nested] of Object.entries(value)) {
      leaks.push(...collectSecretLeaks(nested, [...pathParts, key]));
    }
    return leaks;
  }

  if (hasSecretLikeValue(value)) {
    leaks.push(pathParts.join(".") || "root");
  }

  return leaks;
}

function isIsoDate(value) {
  if (typeof value !== "string") return false;
  const date = new Date(value);
  return Number.isFinite(date.getTime()) && value.includes("T");
}

function hoursBetween(now, isoDate) {
  return (now.getTime() - new Date(isoDate).getTime()) / 3_600_000;
}

function addEvidenceError(errors, field, message) {
  errors.push(`${field}: ${message}`);
}

function parsePolicyDocument(policy) {
  if (!policy) return null;

  if (typeof policy === "string") {
    try {
      return JSON.parse(policy);
    } catch {
      return null;
    }
  }

  if (typeof policy.Policy === "string") {
    return parsePolicyDocument(policy.Policy);
  }

  if (typeof policy === "object") {
    return policy;
  }

  return null;
}

function conditionBoolValue(statement, key) {
  const condition = statement?.Condition || {};
  const boolBlock = condition.Bool || condition["ForAllValues:Bool"] || condition["ForAnyValue:Bool"] || {};
  return boolBlock[key];
}

function statementHasSecureTransportDeny(statement) {
  if (statement?.Effect !== "Deny") return false;
  const value = conditionBoolValue(statement, "aws:SecureTransport");
  return value === false || value === "false";
}

export function hasSecureTransportDeny(policy) {
  const document = parsePolicyDocument(policy);
  if (!document) return false;
  return normalizeArray(document.Statement).some(statementHasSecureTransportDeny);
}

function extractPublicAccessBlock(publicAccessBlock) {
  return publicAccessBlock?.PublicAccessBlockConfiguration || publicAccessBlock || {};
}

function extractEncryptionRule(encryption) {
  const rules = encryption?.ServerSideEncryptionConfiguration?.Rules || encryption?.Rules || [];
  return rules[0] || null;
}

function extractEncryptionAlgorithm(encryption) {
  const rule = extractEncryptionRule(encryption);
  return rule?.ApplyServerSideEncryptionByDefault?.SSEAlgorithm || null;
}

function extractBucketKeyEnabled(encryption) {
  const rule = extractEncryptionRule(encryption);
  return rule?.BucketKeyEnabled === true;
}

function collectLifecycleRuleCount(lifecycle) {
  if (!lifecycle) return 0;
  return Array.isArray(lifecycle.Rules) ? lifecycle.Rules.length : 0;
}

function objectLockEnabled(objectLock) {
  return objectLock?.ObjectLockConfiguration?.ObjectLockEnabled === "Enabled";
}

export function collectS3BackupPostureFindings({
  bucket,
  publicAccessBlock,
  encryption,
  versioning,
  objectLock,
  lifecycle,
  policy
}) {
  const errors = [];
  const warnings = [];
  const checks = [];

  addCheck(
    checks,
    errors,
    "BACKUP_S3_BUCKET formato",
    Boolean(bucket) && !bucket.includes("/") && !bucket.startsWith("s3://"),
    bucket ? "bucket sem barra ou prefixo s3://" : "bucket ausente"
  );

  const block = extractPublicAccessBlock(publicAccessBlock);
  const publicAccessKeys = [
    "BlockPublicAcls",
    "IgnorePublicAcls",
    "BlockPublicPolicy",
    "RestrictPublicBuckets"
  ];
  for (const key of publicAccessKeys) {
    addCheck(
      checks,
      errors,
      `S3 public access block ${key}`,
      block[key] === true,
      block[key] === true ? "ativo" : "desativado ou ausente"
    );
  }

  const algorithm = extractEncryptionAlgorithm(encryption);
  const tlsPolicyEnforced = hasSecureTransportDeny(policy);
  const lifecycleRuleCount = collectLifecycleRuleCount(lifecycle);
  const objectLockActive = objectLockEnabled(objectLock);
  const publicAccessBlocked = publicAccessKeys.every((key) => block[key] === true);

  addCheck(
    checks,
    errors,
    "S3 criptografia padrao",
    algorithm === "AES256" || algorithm === "aws:kms" || algorithm === "aws:kms:dsse",
    algorithm ? `algoritmo ${algorithm}` : "nao configurada"
  );

  if (algorithm === "AES256") {
    addWarning(warnings, "Bucket usa SSE-S3 AES256. E seguro como base, mas KMS da mais controle de chave e auditoria.");
  }

  if (algorithm === "aws:kms" && !extractBucketKeyEnabled(encryption)) {
    addWarning(warnings, "SSE-KMS sem S3 Bucket Key pode gerar custo maior de KMS em backups frequentes.");
  }

  addCheck(
    checks,
    errors,
    "S3 versionamento",
    versioning?.Status === "Enabled",
    versioning?.Status === "Enabled" ? "ativo" : versioning?.Status || "desativado"
  );

  addCheck(
    checks,
    errors,
    "S3 bucket policy exige TLS",
    tlsPolicyEnforced,
    tlsPolicyEnforced ? "Deny aws:SecureTransport=false encontrado" : "Deny TLS ausente"
  );

  if (lifecycleRuleCount > 0) {
    checks.push({
      name: "S3 lifecycle",
      ok: true,
      detail: `${lifecycleRuleCount} regra(s)`
    });
  } else {
    addWarning(warnings, "Lifecycle do bucket nao encontrado. Configure retencao diaria/mensal e transicao para storage frio.");
  }

  if (objectLockActive) {
    checks.push({
      name: "S3 object lock",
      ok: true,
      detail: "ativo"
    });
  } else {
    addWarning(warnings, "Object Lock nao encontrado. Considere imutabilidade para reduzir risco de exclusao maliciosa.");
  }

  return {
    ok: errors.length === 0,
    summary: {
      bucket,
      publicAccessBlocked,
      encryptionAlgorithm: algorithm,
      bucketKeyEnabled: extractBucketKeyEnabled(encryption),
      versioningStatus: versioning?.Status || "Disabled",
      tlsPolicyEnforced,
      lifecycleRuleCount,
      objectLockEnabled: objectLockActive
    },
    checks,
    warnings,
    errors
  };
}

export function buildS3PostureEvidence(report, {
  checkedAt = new Date().toISOString()
} = {}) {
  const summary = report?.summary || {};

  return {
    schemaVersion: 1,
    type: "s3-backup-posture",
    checkedAt,
    bucket: report?.bucket || summary.bucket || null,
    region: report?.region || null,
    publicAccessBlocked: summary.publicAccessBlocked === true,
    encryptionAlgorithm: summary.encryptionAlgorithm || null,
    versioningStatus: summary.versioningStatus || null,
    tlsPolicyEnforced: summary.tlsPolicyEnforced === true,
    lifecycleRuleCount: Number.isInteger(summary.lifecycleRuleCount) ? summary.lifecycleRuleCount : 0,
    objectLockEnabled: summary.objectLockEnabled === true,
    warningCount: Array.isArray(report?.warnings) ? report.warnings.length : 0,
    result: report?.ok === true ? "PASS" : "FAIL"
  };
}

export function validateS3PostureEvidence(evidence, {
  now = new Date(),
  maxAgeHours = defaultMaxAgeHours
} = {}) {
  const errors = [];

  if (!evidence || typeof evidence !== "object" || Array.isArray(evidence)) {
    return ["evidence: arquivo precisa conter um objeto JSON"];
  }

  if (evidence.schemaVersion !== 1) {
    addEvidenceError(errors, "schemaVersion", "precisa ser 1");
  }

  if (evidence.type !== "s3-backup-posture") {
    addEvidenceError(errors, "type", "precisa ser s3-backup-posture");
  }

  if (!isIsoDate(evidence.checkedAt)) {
    addEvidenceError(errors, "checkedAt", "precisa ser data ISO");
  } else {
    const age = hoursBetween(now, evidence.checkedAt);
    if (age < -1) {
      addEvidenceError(errors, "checkedAt", "nao pode estar no futuro");
    }
    if (age > maxAgeHours) {
      addEvidenceError(errors, "checkedAt", `auditoria S3 vencida; ultima evidencia tem ${Math.floor(age)} horas`);
    }
  }

  if (typeof evidence.bucket !== "string" || !evidence.bucket || evidence.bucket.includes("/") || evidence.bucket.startsWith("s3://")) {
    addEvidenceError(errors, "bucket", "informe bucket S3 sem barra ou prefixo s3://");
  }

  if (typeof evidence.region !== "string" || evidence.region.trim().length < 3) {
    addEvidenceError(errors, "region", "informe regiao AWS");
  }

  if (evidence.publicAccessBlocked !== true) {
    addEvidenceError(errors, "publicAccessBlocked", "precisa ser true");
  }

  if (!["AES256", "aws:kms", "aws:kms:dsse"].includes(evidence.encryptionAlgorithm)) {
    addEvidenceError(errors, "encryptionAlgorithm", "precisa ser AES256, aws:kms ou aws:kms:dsse");
  }

  if (evidence.versioningStatus !== "Enabled") {
    addEvidenceError(errors, "versioningStatus", "precisa ser Enabled");
  }

  if (evidence.tlsPolicyEnforced !== true) {
    addEvidenceError(errors, "tlsPolicyEnforced", "precisa ser true");
  }

  if (!Number.isInteger(evidence.lifecycleRuleCount) || evidence.lifecycleRuleCount < 0) {
    addEvidenceError(errors, "lifecycleRuleCount", "precisa ser inteiro maior ou igual a zero");
  }

  if (evidence.result !== "PASS") {
    addEvidenceError(errors, "result", "precisa ser PASS");
  }

  const leaks = collectSecretLeaks(evidence);
  for (const leak of leaks) {
    addEvidenceError(errors, leak, "nao registre segredos, senhas, tokens ou URLs completas com credenciais");
  }

  return errors;
}

export function checkS3PostureEvidenceFile({
  evidencePath = defaultEvidencePath,
  maxAgeHours = defaultMaxAgeHours,
  now = new Date()
} = {}) {
  if (!existsSync(evidencePath)) {
    return {
      ok: false,
      evidencePath,
      errors: [`${path.relative(root, evidencePath).replace(/\\/g, "/")}: evidencia de postura S3 ausente`]
    };
  }

  let evidence;
  try {
    evidence = JSON.parse(readFileSync(evidencePath, "utf8"));
  } catch {
    return {
      ok: false,
      evidencePath,
      errors: [`${path.relative(root, evidencePath).replace(/\\/g, "/")}: JSON invalido`]
    };
  }

  const errors = validateS3PostureEvidence(evidence, { now, maxAgeHours });

  return {
    ok: errors.length === 0,
    evidencePath,
    evidence,
    errors
  };
}

function writeS3PostureEvidence(report, evidencePath) {
  const resolvedPath = path.resolve(root, evidencePath);
  const evidence = buildS3PostureEvidence(report);
  const errors = validateS3PostureEvidence(evidence);

  if (errors.length > 0) {
    return {
      ok: false,
      evidencePath: resolvedPath,
      errors
    };
  }

  mkdirSync(path.dirname(resolvedPath), { recursive: true });
  writeFileSync(resolvedPath, `${JSON.stringify(evidence, null, 2)}\n`, "utf8");

  return {
    ok: true,
    evidencePath: resolvedPath,
    evidence,
    errors: []
  };
}

function awsJson(args) {
  const result = spawnSync("aws", args, {
    encoding: "utf8",
    shell: false
  });

  if (result.error) {
    return {
      ok: false,
      error: result.error.message
    };
  }

  if (result.status !== 0) {
    return {
      ok: false,
      error: (result.stderr || result.stdout || "").trim() || `aws ${args.join(" ")} saiu com codigo ${result.status}`
    };
  }

  const stdout = result.stdout.trim();
  if (!stdout) return { ok: true, value: null };

  try {
    return { ok: true, value: JSON.parse(stdout) };
  } catch {
    return {
      ok: false,
      error: `saida JSON invalida para aws ${args.join(" ")}`
    };
  }
}

function optionalAwsJson(args) {
  const result = awsJson(args);
  if (result.ok) return result;
  return { ok: true, value: null, warning: result.error };
}

export function checkS3BackupPosture({ envFile = resolveBackupEnvFile() } = {}) {
  loadDotEnv(envFile);

  const bucket = process.env.BACKUP_S3_BUCKET || "";
  const region = process.env.AWS_REGION || "";
  const errors = [];
  const warnings = [];

  if (!bucket) errors.push("BACKUP_S3_BUCKET ausente.");
  if (!region) errors.push("AWS_REGION ausente.");
  if (!commandAvailable("aws")) errors.push("AWS CLI nao encontrada no PATH.");

  if (errors.length > 0) {
    return {
      ok: false,
      envFile,
      bucket: bucket || null,
      region: region || null,
      checks: [],
      warnings,
      errors
    };
  }

  const mandatoryCommands = {
    publicAccessBlock: awsJson(["s3api", "get-public-access-block", "--bucket", bucket]),
    encryption: awsJson(["s3api", "get-bucket-encryption", "--bucket", bucket]),
    versioning: awsJson(["s3api", "get-bucket-versioning", "--bucket", bucket]),
    policy: awsJson(["s3api", "get-bucket-policy", "--bucket", bucket])
  };

  for (const [name, result] of Object.entries(mandatoryCommands)) {
    if (!result.ok) {
      errors.push(`${name}: ${result.error}`);
    }
  }

  const objectLock = optionalAwsJson(["s3api", "get-object-lock-configuration", "--bucket", bucket]);
  const lifecycle = optionalAwsJson(["s3api", "get-bucket-lifecycle-configuration", "--bucket", bucket]);

  if (objectLock.warning) addWarning(warnings, `Object Lock nao retornou configuracao: ${objectLock.warning}`);
  if (lifecycle.warning) addWarning(warnings, `Lifecycle nao retornou configuracao: ${lifecycle.warning}`);

  if (errors.length > 0) {
    return {
      ok: false,
      envFile,
      bucket,
      region,
      checks: [],
      warnings,
      errors
    };
  }

  const posture = collectS3BackupPostureFindings({
    bucket,
    publicAccessBlock: mandatoryCommands.publicAccessBlock.value,
    encryption: mandatoryCommands.encryption.value,
    versioning: mandatoryCommands.versioning.value,
    policy: mandatoryCommands.policy.value,
    objectLock: objectLock.value,
    lifecycle: lifecycle.value
  });

  return {
    ...posture,
    envFile,
    bucket,
    region,
    warnings: [...warnings, ...posture.warnings]
  };
}

function main() {
  const args = process.argv.slice(2);
  const envFile = resolveBackupEnvFile(getArg("--env-file"));
  const evidencePath = path.resolve(root, getArg("--evidence", defaultEvidencePath));
  const maxAgeHours = Number(getArg("--max-age-hours", String(defaultMaxAgeHours)));
  const writeEvidencePath = getArg("--write-evidence", undefined);
  const checkEvidence = args.includes("--check-evidence");
  const jsonOutput = args.includes("--json");

  if (checkEvidence) {
    const evidenceReport = checkS3PostureEvidenceFile({ evidencePath, maxAgeHours });

    if (jsonOutput) {
      console.log(JSON.stringify(evidenceReport, null, 2));
    } else {
      console.log("Verificacao de evidencia da postura S3");
      console.log(`Arquivo: ${path.relative(root, evidencePath).replace(/\\/g, "/")}`);
      console.log(`Janela maxima: ${maxAgeHours} hora(s)`);

      if (evidenceReport.ok) {
        console.log(`OK - ultima auditoria S3: ${evidenceReport.evidence.checkedAt}`);
        console.log(`OK - bucket: ${evidenceReport.evidence.bucket}`);
      } else {
        for (const error of evidenceReport.errors) {
          console.error(`ERRO - ${error}`);
        }
      }
    }

    if (!evidenceReport.ok) {
      process.exit(1);
    }
    return;
  }

  const report = checkS3BackupPosture({ envFile });
  const evidenceReport = report.ok && writeEvidencePath
    ? writeS3PostureEvidence(report, writeEvidencePath)
    : null;

  if (evidenceReport && !evidenceReport.ok) {
    report.ok = false;
    report.errors = [...report.errors, ...evidenceReport.errors.map((error) => `evidencia: ${error}`)];
  }

  if (jsonOutput) {
    console.log(JSON.stringify({
      ...report,
      evidencePath: evidenceReport?.evidencePath
    }, null, 2));
  } else {
    console.log("Auditoria de postura S3 para backup externo");
    console.log(`Ambiente: ${report.envFile}`);
    if (report.bucket) console.log(`Bucket: ${report.bucket}`);
    if (report.region) console.log(`Regiao: ${report.region}`);

    for (const check of report.checks) {
      console.log(`${check.ok ? "OK" : "ERRO"} - ${check.name}: ${check.detail}`);
    }

    for (const warning of report.warnings) {
      console.log(`AVISO - ${warning}`);
    }

    for (const error of report.errors) {
      console.log(`ERRO - ${error}`);
    }

    if (evidenceReport?.ok) {
      console.log(`OK - evidencia gravada: ${path.relative(root, evidenceReport.evidencePath).replace(/\\/g, "/")}`);
    }
  }

  if (!report.ok) {
    process.exit(1);
  }
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  main();
}
