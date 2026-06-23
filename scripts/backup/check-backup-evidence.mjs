import { existsSync, readFileSync } from "node:fs";
import path from "node:path";
import { pathToFileURL } from "node:url";

const root = process.cwd();
const defaultEvidencePath = path.join(root, "docs", "security", "backups", "latest.json");
const defaultMaxAgeHours = 36;

function getArg(args, name, fallback = undefined) {
  const index = args.indexOf(name);
  if (index === -1) return fallback;
  return args[index + 1] || fallback;
}

function hasSecretLikeValue(value) {
  if (typeof value !== "string") return false;
  if (/postgres(ql)?:\/\/[^/\s]+:[^@\s]+@/i.test(value)) return true;
  if (/(AWS_SECRET_ACCESS_KEY|AUTH_SECRET|TOKEN|PASSWORD|SENHA|SECRET=|DATABASE_URL=)/i.test(value)) return true;
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

function add(errors, field, message) {
  errors.push(`${field}: ${message}`);
}

function isIsoDate(value) {
  if (typeof value !== "string") return false;
  const date = new Date(value);
  return Number.isFinite(date.getTime()) && value.includes("T");
}

function hoursBetween(now, isoDate) {
  return (now.getTime() - new Date(isoDate).getTime()) / 3_600_000;
}

export function validateBackupEvidence(evidence, {
  now = new Date(),
  maxAgeHours = defaultMaxAgeHours
} = {}) {
  const errors = [];

  if (!evidence || typeof evidence !== "object" || Array.isArray(evidence)) {
    return ["evidence: arquivo precisa conter um objeto JSON"];
  }

  if (evidence.schemaVersion !== 1) {
    add(errors, "schemaVersion", "precisa ser 1");
  }

  if (!isIsoDate(evidence.performedAt)) {
    add(errors, "performedAt", "precisa ser data ISO");
  } else {
    const age = hoursBetween(now, evidence.performedAt);
    if (age < -1) {
      add(errors, "performedAt", "nao pode estar no futuro");
    }
    if (age > maxAgeHours) {
      add(errors, "performedAt", `backup vencido; ultima evidencia tem ${Math.floor(age)} horas`);
    }
  }

  if (evidence.type !== "full-logical-backup") {
    add(errors, "type", "precisa ser full-logical-backup");
  }

  if (typeof evidence.operator !== "string" || evidence.operator.trim().length < 2) {
    add(errors, "operator", "informe responsavel pelo backup");
  }

  if (typeof evidence.destination !== "string" || !/^s3:\/\/[^/]+\/.+\.dump$/i.test(evidence.destination)) {
    add(errors, "destination", "informe caminho s3:// do dump enviado");
  }

  if (typeof evidence.checksumUri !== "string" || !/^s3:\/\/[^/]+\/.+\.sha256$/i.test(evidence.checksumUri)) {
    add(errors, "checksumUri", "informe caminho s3:// do checksum enviado");
  }

  if (typeof evidence.checksumSha256 !== "string" || !/^[a-f0-9]{64}$/i.test(evidence.checksumSha256)) {
    add(errors, "checksumSha256", "precisa ser SHA256 hexadecimal");
  }

  if (!Number.isInteger(evidence.sizeBytes) || evidence.sizeBytes < 1) {
    add(errors, "sizeBytes", "precisa ser inteiro maior que zero");
  }

  if (!["AES256", "aws:kms"].includes(evidence.encryption)) {
    add(errors, "encryption", "precisa ser AES256 ou aws:kms");
  }

  if (evidence.result !== "PASS") {
    add(errors, "result", "precisa ser PASS");
  }

  const leaks = collectSecretLeaks(evidence);
  for (const leak of leaks) {
    add(errors, leak, "nao registre segredos, senhas, tokens ou URLs completas com credenciais");
  }

  return errors;
}

export function checkBackupEvidenceFile({
  evidencePath = defaultEvidencePath,
  maxAgeHours = defaultMaxAgeHours,
  now = new Date()
} = {}) {
  if (!existsSync(evidencePath)) {
    return {
      ok: false,
      evidencePath,
      errors: [`${path.relative(root, evidencePath).replace(/\\/g, "/")}: evidencia de backup completo ausente`]
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

  const errors = validateBackupEvidence(evidence, { now, maxAgeHours });

  return {
    ok: errors.length === 0,
    evidencePath,
    evidence,
    errors
  };
}

function main() {
  const args = process.argv.slice(2);
  const evidencePath = path.resolve(root, getArg(args, "--evidence", defaultEvidencePath));
  const maxAgeHours = Number(getArg(args, "--max-age-hours", String(defaultMaxAgeHours)));
  const jsonOutput = args.includes("--json");
  const report = checkBackupEvidenceFile({ evidencePath, maxAgeHours });

  if (jsonOutput) {
    console.log(JSON.stringify(report, null, 2));
  } else {
    console.log("Verificacao de evidencia de backup completo");
    console.log(`Arquivo: ${path.relative(root, evidencePath).replace(/\\/g, "/")}`);
    console.log(`Janela maxima: ${maxAgeHours} hora(s)`);

    if (report.ok) {
      console.log(`OK - ultimo backup: ${report.evidence.performedAt}`);
      console.log(`OK - destino: ${report.evidence.destination}`);
    } else {
      for (const error of report.errors) {
        console.error(`ERRO - ${error}`);
      }
    }
  }

  if (!report.ok) {
    process.exit(1);
  }
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  main();
}
