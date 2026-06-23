import { existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import path from "node:path";
import { pathToFileURL } from "node:url";

const root = process.cwd();
const DEFAULT_TIMEOUT_MS = 10_000;
const DEFAULT_EVIDENCE_PATH = path.join(root, "docs", "security", "monitoring", "health-latest.json");
const DEFAULT_MAX_EVIDENCE_AGE_MINUTES = 30;

function getArg(args, name, fallback = undefined) {
  const index = args.indexOf(name);
  if (index === -1) return fallback;
  return args[index + 1] || fallback;
}

function maskSensitiveText(value) {
  return String(value || "")
    .replace(/\/\/([^:/?#]+):([^@/?#]+)@/g, "//$1:***@")
    .replace(/([?&](token|key|secret|password|senha)=)[^&]+/gi, "$1***");
}

function hasSecretLikeValue(value) {
  if (typeof value !== "string") return false;
  if (/postgres(ql)?:\/\/[^/\s]+:[^@\s]+@/i.test(value)) return true;
  if (/(AUTH_SECRET|TOKEN|PASSWORD|SENHA|SECRET=|DATABASE_URL=)/i.test(value)) return true;

  try {
    const url = new URL(value);
    if (url.username || url.password) return true;
    return [...url.searchParams.keys()].some((key) => /token|key|secret|password|senha/i.test(key));
  } catch {
    return false;
  }
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

function minutesBetween(now, isoDate) {
  return (now.getTime() - new Date(isoDate).getTime()) / 60_000;
}

export function normalizeHealthUrl(value) {
  const raw = String(value || "").trim();

  if (!raw) {
    return "";
  }

  const url = new URL(raw.startsWith("http") ? raw : `https://${raw}`);
  if (!url.pathname || url.pathname === "/") {
    url.pathname = "/api/health";
  } else if (!url.pathname.endsWith("/api/health")) {
    url.pathname = `${url.pathname.replace(/\/$/, "")}/api/health`;
  }

  return url.toString();
}

export function sanitizeUrlForLog(value) {
  try {
    const url = new URL(value);
    url.username = url.username ? "***" : "";
    url.password = url.password ? "***" : "";

    for (const key of [...url.searchParams.keys()]) {
      if (/token|key|secret|password/i.test(key)) {
        url.searchParams.set(key, "***");
      }
    }

    return url.toString();
  } catch {
    return maskSensitiveText(value);
  }
}

export function resolveHealthUrl({ args = process.argv.slice(2), env = process.env } = {}) {
  const fromArg = getArg(args, "--url", "");
  const fromEnv = env.HEALTHCHECK_URL || env.NEXT_PUBLIC_APP_URL || env.VERCEL_PROJECT_PRODUCTION_URL || "";
  return normalizeHealthUrl(fromArg || fromEnv);
}

export function evaluateHealthResponse({ statusCode, body }) {
  const errors = [];

  if (statusCode !== 200) {
    errors.push(`status HTTP inesperado: ${statusCode}`);
  }

  if (!body || typeof body !== "object") {
    errors.push("resposta JSON ausente ou invalida");
    return { ok: false, errors };
  }

  if (body.ok !== true || body.status !== "ok") {
    errors.push("healthcheck nao esta OK");
  }

  if (body.checks?.app !== "ok") {
    errors.push("app nao retornou estado OK");
  }

  if (body.checks?.database !== "ok") {
    errors.push("banco de dados nao retornou estado OK");
  }

  return {
    ok: errors.length === 0,
    errors
  };
}

export function buildHealthEvidence({
  url,
  result,
  evaluation,
  checkedAt = new Date().toISOString()
}) {
  const body = result?.body || {};
  const checks = body.checks || {};

  return {
    schemaVersion: 1,
    type: "healthcheck",
    checkedAt,
    url: sanitizeUrlForLog(url),
    statusCode: result?.statusCode ?? null,
    ok: body.ok === true,
    status: body.status || null,
    app: checks.app || null,
    database: checks.database || null,
    errorCount: Array.isArray(evaluation?.errors) ? evaluation.errors.length : 0,
    result: evaluation?.ok === true ? "PASS" : "FAIL"
  };
}

export function validateHealthEvidence(evidence, {
  now = new Date(),
  maxAgeMinutes = DEFAULT_MAX_EVIDENCE_AGE_MINUTES
} = {}) {
  const errors = [];

  if (!evidence || typeof evidence !== "object" || Array.isArray(evidence)) {
    return ["evidence: arquivo precisa conter um objeto JSON"];
  }

  if (evidence.schemaVersion !== 1) {
    add(errors, "schemaVersion", "precisa ser 1");
  }

  if (evidence.type !== "healthcheck") {
    add(errors, "type", "precisa ser healthcheck");
  }

  if (!isIsoDate(evidence.checkedAt)) {
    add(errors, "checkedAt", "precisa ser data ISO");
  } else {
    const age = minutesBetween(now, evidence.checkedAt);
    if (age < -1) {
      add(errors, "checkedAt", "nao pode estar no futuro");
    }
    if (age > maxAgeMinutes) {
      add(errors, "checkedAt", `healthcheck vencido; ultima evidencia tem ${Math.floor(age)} minutos`);
    }
  }

  if (typeof evidence.url !== "string" || !/^https?:\/\/.+\/api\/health$/i.test(evidence.url)) {
    add(errors, "url", "precisa apontar para /api/health");
  }

  if (evidence.statusCode !== 200) {
    add(errors, "statusCode", "precisa ser 200");
  }

  if (evidence.ok !== true || evidence.status !== "ok") {
    add(errors, "status", "precisa estar OK");
  }

  if (evidence.app !== "ok") {
    add(errors, "app", "precisa ser ok");
  }

  if (evidence.database !== "ok") {
    add(errors, "database", "precisa ser ok");
  }

  if (evidence.errorCount !== 0) {
    add(errors, "errorCount", "precisa ser 0");
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

export function checkHealthEvidenceFile({
  evidencePath = DEFAULT_EVIDENCE_PATH,
  maxAgeMinutes = DEFAULT_MAX_EVIDENCE_AGE_MINUTES,
  now = new Date()
} = {}) {
  if (!existsSync(evidencePath)) {
    return {
      ok: false,
      evidencePath,
      errors: [`${path.relative(root, evidencePath).replace(/\\/g, "/")}: evidencia de healthcheck ausente`]
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

  const errors = validateHealthEvidence(evidence, { now, maxAgeMinutes });

  return {
    ok: errors.length === 0,
    evidencePath,
    evidence,
    errors
  };
}

function writeHealthEvidence(evidence, evidencePath) {
  const resolvedPath = path.resolve(root, evidencePath);
  const errors = validateHealthEvidence(evidence);

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

async function fetchJson(url, timeoutMs = DEFAULT_TIMEOUT_MS) {
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), timeoutMs);

  try {
    const response = await fetch(url, {
      method: "GET",
      headers: {
        Accept: "application/json"
      },
      cache: "no-store",
      signal: controller.signal
    });
    let body = null;

    try {
      body = await response.json();
    } catch {
      body = null;
    }

    return {
      statusCode: response.status,
      body
    };
  } finally {
    clearTimeout(timeout);
  }
}

async function main() {
  const args = process.argv.slice(2);
  const evidencePath = path.resolve(root, getArg(args, "--evidence", DEFAULT_EVIDENCE_PATH));
  const maxAgeMinutes = Number(getArg(args, "--max-age-minutes", String(DEFAULT_MAX_EVIDENCE_AGE_MINUTES)));
  const writeEvidencePath = getArg(args, "--write-evidence", undefined);
  const checkEvidence = args.includes("--check-evidence");
  const jsonOutput = args.includes("--json");

  if (checkEvidence) {
    const evidenceReport = checkHealthEvidenceFile({ evidencePath, maxAgeMinutes });

    if (jsonOutput) {
      console.log(JSON.stringify(evidenceReport, null, 2));
    } else {
      console.log("Verificacao de evidencia de healthcheck");
      console.log(`Arquivo: ${path.relative(root, evidencePath).replace(/\\/g, "/")}`);
      console.log(`Janela maxima: ${maxAgeMinutes} minuto(s)`);

      if (evidenceReport.ok) {
        console.log(`OK - ultimo healthcheck: ${evidenceReport.evidence.checkedAt}`);
        console.log(`OK - endpoint: ${evidenceReport.evidence.url}`);
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

  const url = resolveHealthUrl({ args });

  if (!url) {
    console.error("Informe HEALTHCHECK_URL ou use --url https://seu-site.vercel.app.");
    process.exit(1);
  }

  const safeUrl = sanitizeUrlForLog(url);

  try {
    const result = await fetchJson(url);
    const evaluation = evaluateHealthResponse(result);
    const evidenceReport = evaluation.ok && writeEvidencePath
      ? writeHealthEvidence(buildHealthEvidence({ url, result, evaluation }), writeEvidencePath)
      : null;

    if (evidenceReport && !evidenceReport.ok) {
      evaluation.ok = false;
      evaluation.errors = [...evaluation.errors, ...evidenceReport.errors.map((error) => `evidencia: ${error}`)];
    }

    if (!evaluation.ok) {
      console.error(`Healthcheck falhou em ${safeUrl}`);
      for (const error of evaluation.errors) {
        console.error(`- ${error}`);
      }
      process.exit(1);
    }

    console.log(`OK: healthcheck operacional em ${safeUrl}`);
    if (evidenceReport?.ok) {
      console.log(`OK: evidencia gravada em ${path.relative(root, evidenceReport.evidencePath).replace(/\\/g, "/")}`);
    }
  } catch (error) {
    const reason = error instanceof Error && error.name === "AbortError"
      ? "tempo limite excedido"
      : "falha ao acessar o endpoint";

    console.error(`Healthcheck falhou em ${safeUrl}: ${reason}.`);
    process.exit(1);
  }
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  main();
}
