import { readdir, readFile } from "node:fs/promises";
import path from "node:path";

const root = process.cwd();
const scanDirs = ["src", "prisma", "scripts"];
const blockedPatterns = [
  "$queryRaw",
  "$executeRaw",
  "queryRawUnsafe",
  "executeRawUnsafe",
  "Prisma.raw",
  "Prisma.sql"
];
const allowedExtensions = new Set([".ts", ".tsx", ".js", ".jsx", ".mjs", ".cjs"]);
const ignoredDirs = new Set(["node_modules", ".next", ".git", ".vercel"]);

async function listFiles(dir) {
  const entries = await readdir(dir, { withFileTypes: true });
  const files = [];

  for (const entry of entries) {
    if (ignoredDirs.has(entry.name)) continue;

    const fullPath = path.join(dir, entry.name);

    if (path.basename(fullPath) === "check-no-raw-sql.mjs") {
      continue;
    }

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
    for (const pattern of blockedPatterns) {
      if (line.includes(pattern)) {
        findings.push({
          file,
          line: index + 1,
          pattern,
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
  console.error("SQL raw bloqueado. Use Prisma ORM ou solicite revisao tecnica antes de liberar SQL manual.");

  for (const finding of findings) {
    console.error(`- ${finding.file}:${finding.line} (${finding.pattern}) ${finding.source}`);
  }

  process.exit(1);
}

console.log("OK: nenhuma chamada SQL raw bloqueada encontrada.");
