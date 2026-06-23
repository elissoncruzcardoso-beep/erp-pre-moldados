import { readdir, readFile } from "node:fs/promises";
import path from "node:path";

const root = process.cwd();
const scanDirs = ["src"];
const allowedExtensions = new Set([".ts", ".tsx"]);
const ignoredDirs = new Set(["node_modules", ".next", ".git", ".vercel"]);
const allowedUnboundedCalls = new Map([
  [
    "src/lib/production/consume-composition.ts:tx.stockBalance",
    "Consumo transacional por item/deposito precisa percorrer saldos/lotes disponiveis."
  ],
  [
    "src/lib/stock/transactions.ts:tx.stockBalance",
    "Consumo transacional por item/deposito precisa percorrer saldos/lotes disponiveis."
  ]
]);

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

function extractCallArguments(source, openParenIndex) {
  let depth = 0;
  let quote = "";
  let inLineComment = false;
  let inBlockComment = false;

  for (let index = openParenIndex; index < source.length; index += 1) {
    const char = source[index];
    const next = source[index + 1];

    if (inLineComment) {
      if (char === "\n") inLineComment = false;
      continue;
    }

    if (inBlockComment) {
      if (char === "*" && next === "/") {
        inBlockComment = false;
        index += 1;
      }
      continue;
    }

    if (quote) {
      if (char === "\\") {
        index += 1;
        continue;
      }

      if (char === quote) {
        quote = "";
      }
      continue;
    }

    if (char === "/" && next === "/") {
      inLineComment = true;
      index += 1;
      continue;
    }

    if (char === "/" && next === "*") {
      inBlockComment = true;
      index += 1;
      continue;
    }

    if (char === "\"" || char === "'" || char === "`") {
      quote = char;
      continue;
    }

    if (char === "(") {
      depth += 1;
      continue;
    }

    if (char === ")") {
      depth -= 1;
      if (depth === 0) {
        return source.slice(openParenIndex + 1, index);
      }
    }
  }

  return "";
}

function callTargetBefore(source, findManyIndex) {
  const before = source.slice(0, findManyIndex);
  const match = before.match(/([A-Za-z_$][\w$]*(?:\.[A-Za-z_$][\w$]*)*)\.\s*$/);
  return match?.[1] || "unknown";
}

function lineNumberAt(source, index) {
  return source.slice(0, index).split(/\r?\n/).length;
}

function hasTakeLimit(args) {
  return /(?:^|[,{]\s*)take\s*(?::|[,}])/m.test(args);
}

const files = (await Promise.all(
  scanDirs.map(async (dir) => {
    const fullPath = path.join(root, dir);
    return listFiles(fullPath).catch(() => []);
  })
)).flat();

const findings = [];
const allowed = [];

for (const file of files) {
  const source = await readFile(file, "utf8");
  const relativeFile = path.relative(root, file).replace(/\\/g, "/");
  const pattern = /\.findMany\s*\(/g;
  let match;

  while ((match = pattern.exec(source))) {
    const openParenIndex = source.indexOf("(", match.index);
    const args = extractCallArguments(source, openParenIndex);

    if (!args.trim().startsWith("{")) {
      continue;
    }

    if (hasTakeLimit(args)) {
      continue;
    }

    const target = callTargetBefore(source, match.index + 1);
    const allowKey = `${relativeFile}:${target}`;
    const finding = {
      file: relativeFile,
      line: lineNumberAt(source, match.index),
      target,
      reason: allowedUnboundedCalls.get(allowKey)
    };

    if (finding.reason) {
      allowed.push(finding);
      continue;
    }

    findings.push(finding);
  }
}

if (allowed.length > 0) {
  console.log("FindMany sem take permitidos por regra transacional documentada:");
  for (const item of allowed) {
    console.log(`- ${item.file}:${item.line} (${item.target}) ${item.reason}`);
  }
}

if (findings.length > 0) {
  console.error("findMany sem limite encontrado. Use take/paginacao ou documente uma excecao transacional.");

  for (const finding of findings) {
    console.error(`- ${finding.file}:${finding.line} (${finding.target})`);
  }

  process.exit(1);
}

console.log("OK: nenhuma findMany sem limite nao documentada encontrada.");
