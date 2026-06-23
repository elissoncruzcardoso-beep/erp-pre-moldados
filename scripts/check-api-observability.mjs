import { existsSync } from "node:fs";
import { readdir, readFile } from "node:fs/promises";
import path from "node:path";
import { pathToFileURL } from "node:url";

const root = process.cwd();
const ignoredDirs = new Set(["node_modules", ".next", ".git", ".vercel"]);
const mutatingMethods = ["POST", "PUT", "PATCH", "DELETE"];

const ignoredRoutes = new Map([
  [
    "src/app/api/auth/logout/route.ts",
    "Logout altera apenas cookie de sessao e nao executa operacao de negocio persistente."
  ]
]);

async function listRouteFiles(dir) {
  if (!existsSync(dir)) return [];

  const entries = await readdir(dir, { withFileTypes: true });
  const files = [];

  for (const entry of entries) {
    if (ignoredDirs.has(entry.name)) continue;

    const fullPath = path.join(dir, entry.name);

    if (entry.isDirectory()) {
      files.push(...await listRouteFiles(fullPath));
      continue;
    }

    if (entry.name === "route.ts" || entry.name === "route.js") {
      files.push(fullPath);
    }
  }

  return files;
}

function normalizeRelative(file, cwd) {
  return path.relative(cwd, file).replace(/\\/g, "/");
}

function getMutatingMethods(content) {
  return mutatingMethods.filter((method) =>
    new RegExp(`export\\s+async\\s+function\\s+${method}\\b`).test(content)
  );
}

function hasOperationalLogger(content) {
  return /\blogApi(Event|Error)\s*\(/.test(content);
}

function hasHandleApiError(content) {
  return /\bhandleApiError\s*\(/.test(content);
}

function hasHandleApiErrorContext(content) {
  return /\bhandleApiError\s*\([\s\S]*?\{\s*[\s\S]*?\bcontext\s*:/.test(content);
}

function hasRequestInContext(content) {
  return /\bcontext\s*:\s*\{[\s\S]*?\brequest\b/.test(content);
}

function hasModuleAndActionInContext(content) {
  return /\bcontext\s*:\s*\{[\s\S]*?\bmodule\s*:/.test(content) &&
    /\bcontext\s*:\s*\{[\s\S]*?\baction\s*:/.test(content);
}

export function collectApiObservabilityFindings(content, relativeFile) {
  const methods = getMutatingMethods(content);
  const findings = [];

  if (methods.length === 0 || ignoredRoutes.has(relativeFile)) {
    return findings;
  }

  if (!hasHandleApiError(content) && !hasOperationalLogger(content)) {
    findings.push(`Rota mutavel (${methods.join(", ")}) precisa registrar erro operacional com handleApiError ou logApiError.`);
    return findings;
  }

  if (hasOperationalLogger(content)) {
    return findings;
  }

  if (!hasHandleApiErrorContext(content)) {
    findings.push("handleApiError precisa receber context com request, module e action para rastreio operacional.");
    return findings;
  }

  if (!hasRequestInContext(content)) {
    findings.push("context do handleApiError precisa incluir request para preservar x-request-id.");
  }

  if (!hasModuleAndActionInContext(content)) {
    findings.push("context do handleApiError precisa incluir module e action.");
  }

  return findings;
}

export async function collectApiObservabilityErrors({ cwd = root } = {}) {
  const baseApiDir = path.join(cwd, "src", "app", "api");
  const files = await listRouteFiles(baseApiDir);
  const errors = [];

  for (const file of files) {
    const content = await readFile(file, "utf8");
    const relativeFile = normalizeRelative(file, cwd);
    const findings = collectApiObservabilityFindings(content, relativeFile);

    for (const finding of findings) {
      errors.push(`${relativeFile}: ${finding}`);
    }
  }

  return errors;
}

async function main() {
  const errors = await collectApiObservabilityErrors();

  if (errors.length > 0) {
    console.error("Guard de observabilidade das APIs encontrou lacunas:");
    for (const error of errors) {
      console.error(`- ${error}`);
    }
    process.exit(1);
  }

  console.log("OK: APIs mutaveis possuem log operacional com requestId.");
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  main();
}
