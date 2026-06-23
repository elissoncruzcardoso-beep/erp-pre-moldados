import { readdir, readFile } from "node:fs/promises";
import path from "node:path";

const root = process.cwd();
const scanDirs = ["src/app/api", "src/lib/api"];
const allowedExtensions = new Set([".ts", ".tsx", ".js", ".jsx", ".mjs", ".cjs"]);
const ignoredDirs = new Set(["node_modules", ".next", ".git", ".vercel"]);

const blockedPatterns = [
  {
    name: "Fallback para error.message",
    pattern: /\|\|\s*error\.message/
  },
  {
    name: "Ternario devolvendo error.message",
    pattern: /\?\s*error\.message\s*:/
  },
  {
    name: "Resposta direta com error.message",
    pattern: /\bapi(?:Error|ValidationError|Conflict|Unauthorized|Forbidden|Success)?\([^;\n]*error\.message/
  }
];

const allowedPatterns = [
  /const\s+rawMessage\s*=\s*error\s+instanceof\s+Error\s+\?\s+error\.message\s+:\s*""/
];

async function listFiles(dir) {
  const entries = await readdir(dir, { withFileTypes: true });
  const files = [];

  for (const entry of entries) {
    if (ignoredDirs.has(entry.name)) continue;

    const fullPath = path.join(dir, entry.name);

    if (entry.isDirectory()) {
      files.push(...await listFiles(fullPath));
      continue;
    }

    if (allowedExtensions.has(path.extname(entry.name))) {
      files.push(fullPath);
    }
  }

  return files;
}

function findBlockedUsage(content, file) {
  const lines = content.split(/\r?\n/);
  const findings = [];

  lines.forEach((line, index) => {
    if (allowedPatterns.some((pattern) => pattern.test(line))) {
      return;
    }

    for (const rule of blockedPatterns) {
      if (rule.pattern.test(line)) {
        findings.push({
          file,
          line: index + 1,
          rule: rule.name,
          source: line.trim()
        });
      }
    }
  });

  return findings;
}

const files = (await Promise.all(
  scanDirs.map(async (dir) => {
    const fullPath = path.join(root, dir);
    return listFiles(fullPath).catch(() => []);
  })
)).flat();

const findings = [];

for (const file of files) {
  const content = await readFile(file, "utf8");
  findings.push(...findBlockedUsage(content, path.relative(root, file)));
}

if (findings.length > 0) {
  console.error("Vazamento de erro tecnico bloqueado. Use mensagens conhecidas ou handleApiError com fallback generico.");

  for (const finding of findings) {
    console.error(`- ${finding.file}:${finding.line} (${finding.rule}) ${finding.source}`);
  }

  process.exit(1);
}

console.log("OK: nenhuma API devolvendo error.message cru encontrada.");
