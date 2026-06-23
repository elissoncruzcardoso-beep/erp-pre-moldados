import { existsSync } from "node:fs";
import { readdir, readFile } from "node:fs/promises";
import path from "node:path";
import { pathToFileURL } from "node:url";

const root = process.cwd();
const apiDir = path.join(root, "src", "app", "api");
const ignoredDirs = new Set(["node_modules", ".next", ".git", ".vercel"]);
const mutatingMethods = ["POST", "PUT", "PATCH", "DELETE"];

const nonDatabaseMutationRoutes = new Map([
  [
    "src/app/api/auth/logout/route.ts",
    "Logout limpa apenas o cookie de sessao no cliente; nao altera banco de dados."
  ]
]);

const auditedServiceCalls = [
  "autoReleaseCuredBatches",
  "cleanupAuditLogs",
  "cancelDirectSale",
  "createDirectSale"
];

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

function hasAuditCoverage(content) {
  if (/\bauditLog\s*\.\s*create\b/.test(content) || /\bAuditAction\b/.test(content)) {
    return true;
  }

  return auditedServiceCalls.some((serviceName) =>
    new RegExp(`\\b${serviceName}\\s*\\(`).test(content)
  );
}

function routeFindings(content, relativeFile) {
  const methods = getMutatingMethods(content);
  const findings = [];

  if (methods.length === 0) return findings;
  if (nonDatabaseMutationRoutes.has(relativeFile)) return findings;

  if (!hasAuditCoverage(content)) {
    findings.push(
      `Rota mutavel (${methods.join(", ")}) precisa registrar auditLog.create ou chamar um servico auditado.`
    );
  }

  return findings;
}

export async function collectApiAuditCoverageErrors({ cwd = root } = {}) {
  const baseApiDir = path.join(cwd, "src", "app", "api");
  const files = await listRouteFiles(baseApiDir);
  const errors = [];

  for (const file of files) {
    const content = await readFile(file, "utf8");
    const relativeFile = normalizeRelative(file, cwd);
    const findings = routeFindings(content, relativeFile);

    for (const finding of findings) {
      errors.push(`${relativeFile}: ${finding}`);
    }
  }

  return errors;
}

async function main() {
  const errors = await collectApiAuditCoverageErrors();

  if (errors.length > 0) {
    console.error("Guard de auditoria das APIs falhou:");
    for (const error of errors) {
      console.error(`- ${error}`);
    }
    process.exit(1);
  }

  console.log("OK: APIs mutaveis possuem auditoria ou excecao documentada.");
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  main();
}
