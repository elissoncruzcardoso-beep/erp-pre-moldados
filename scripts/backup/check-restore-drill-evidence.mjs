import { existsSync, readFileSync } from "node:fs";
import path from "node:path";
import { pathToFileURL } from "node:url";

const root = process.cwd();
const defaultEvidencePath = path.join(root, "docs", "security", "restore-drills", "latest.json");
const defaultMaxAgeDays = 45;

function getArg(args, name, fallback = undefined) {
  const index = args.indexOf(name);
  if (index === -1) return fallback;
  return args[index + 1] || fallback;
}

function hasSecretLikeValue(value) {
  if (typeof value !== "string") return false;
  if (/postgres(ql)?:\/\/[^/\s]+:[^@\s]+@/i.test(value)) return true;
  if (/(AWS_SECRET_ACCESS_KEY|AUTH_SECRET|TOKEN|PASSWORD|SENHA|SECRET=)/i.test(value)) return true;
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

function daysBetween(now, isoDate) {
  return (now.getTime() - new Date(isoDate).getTime()) / 86_400_000;
}

export function validateRestoreDrillEvidence(evidence, {
  now = new Date(),
  maxAgeDays = defaultMaxAgeDays
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
    const age = daysBetween(now, evidence.performedAt);
    if (age < -1) {
      add(errors, "performedAt", "nao pode estar no futuro");
    }
    if (age > maxAgeDays) {
      add(errors, "performedAt", `restore drill vencido; ultimo teste tem ${Math.floor(age)} dias`);
    }
  }

  if (typeof evidence.operator !== "string" || evidence.operator.trim().length < 2) {
    add(errors, "operator", "informe responsavel pelo teste");
  }

  if (typeof evidence.sourceBackup !== "string" || !/^s3:\/\/[^/]+\/.+/i.test(evidence.sourceBackup)) {
    add(errors, "sourceBackup", "informe caminho s3:// do dump restaurado");
  }

  if (typeof evidence.restoreTarget !== "string" || !/(restore|drill|teste|test|tmp|temp|ci)/i.test(evidence.restoreTarget)) {
    add(errors, "restoreTarget", "informe resumo seguro do banco temporario de restore");
  }

  if (evidence.checksumVerified !== true) {
    add(errors, "checksumVerified", "precisa ser true");
  }

  if (evidence.userTableVerified !== true) {
    add(errors, "userTableVerified", "precisa ser true");
  }

  if (!Number.isInteger(evidence.publicTableCount) || evidence.publicTableCount < 1) {
    add(errors, "publicTableCount", "precisa ser inteiro maior que zero");
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

export function checkRestoreDrillEvidenceFile({
  evidencePath = defaultEvidencePath,
  maxAgeDays = defaultMaxAgeDays,
  now = new Date()
} = {}) {
  if (!existsSync(evidencePath)) {
    return {
      ok: false,
      evidencePath,
      errors: [`${path.relative(root, evidencePath).replace(/\\/g, "/")}: evidencia de restore drill ausente`]
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

  const errors = validateRestoreDrillEvidence(evidence, { now, maxAgeDays });

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
  const maxAgeDays = Number(getArg(args, "--max-age-days", String(defaultMaxAgeDays)));
  const jsonOutput = args.includes("--json");
  const report = checkRestoreDrillEvidenceFile({ evidencePath, maxAgeDays });

  if (jsonOutput) {
    console.log(JSON.stringify(report, null, 2));
  } else {
    console.log("Verificacao de evidencia de restore drill");
    console.log(`Arquivo: ${path.relative(root, evidencePath).replace(/\\/g, "/")}`);
    console.log(`Janela maxima: ${maxAgeDays} dia(s)`);

    if (report.ok) {
      console.log(`OK - ultimo restore drill: ${report.evidence.performedAt}`);
      console.log(`OK - backup testado: ${report.evidence.sourceBackup}`);
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
