import { readdir, readFile } from "node:fs/promises";
import { existsSync } from "node:fs";
import path from "node:path";
import { pathToFileURL } from "node:url";

const root = process.cwd();
const apiDir = path.join(root, "src", "app", "api");
const ignoredDirs = new Set(["node_modules", ".next", ".git", ".vercel"]);
const mutatingMethods = ["POST", "PUT", "PATCH", "DELETE"];

const publicMutationRoutes = new Set([
  "src/app/api/auth/login/route.ts",
  "src/app/api/auth/logout/route.ts",
  "src/app/api/bot/telegram/route.ts",
  "src/app/api/cron/auto-liberar-cura/route.ts",
  "src/app/api/setup/admin-password/route.ts"
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

function hasMutatingHandler(content) {
  return mutatingMethods.some((method) =>
    new RegExp(`export\\s+async\\s+function\\s+${method}\\b`).test(content)
  );
}

function routeFindings(content, relativeFile) {
  const findings = [];

  const sessionImports = content.match(/import\s+\{([^}]+)\}\s+from\s+["']@\/lib\/auth\/session["']/);
  if (sessionImports && /\bgetSession\b/.test(sessionImports[1])) {
    findings.push("API nao deve importar getSession direto de lib/auth/session; use requireApiSession em lib/auth/guards.");
  }

  if (/\bgetSession\s*\(/.test(content)) {
    findings.push("API nao deve chamar getSession manualmente; use requireApiSession ou getOptionalApiSession no helper.");
  }

  if (
    hasMutatingHandler(content) &&
    !publicMutationRoutes.has(relativeFile) &&
    !/\brequireApiSession\s*\(/.test(content)
  ) {
    findings.push("Rota mutavel precisa chamar requireApiSession ou entrar explicitamente na allowlist de webhook/auth/cron/setup.");
  }

  return findings;
}

export async function collectApiAuthGuardErrors({ cwd = root } = {}) {
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
  const errors = await collectApiAuthGuardErrors();

  if (errors.length > 0) {
    console.error("Guard de autenticacao das APIs falhou:");
    for (const error of errors) {
      console.error(`- ${error}`);
    }
    process.exit(1);
  }

  console.log("OK: APIs mutaveis usam requireApiSession ou allowlist explicita.");
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  main();
}
