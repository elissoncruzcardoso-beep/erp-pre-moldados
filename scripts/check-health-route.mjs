import { readFileSync } from "node:fs";
import path from "node:path";
import { pathToFileURL } from "node:url";

const routePath = path.join(process.cwd(), "src", "app", "api", "health", "route.ts");
const blockedRawPatterns = [
  "$" + "queryRaw",
  "$" + "executeRaw",
  "queryRaw" + "Unsafe",
  "executeRaw" + "Unsafe",
  "Prisma." + "raw",
  "Prisma." + "sql"
];

export function collectHealthRouteErrors(content) {
  const errors = [];

  if (!/export\s+async\s+function\s+GET\s*\(/.test(content)) {
    errors.push("Healthcheck precisa expor apenas GET publico.");
  }

  if (/export\s+async\s+function\s+(POST|PUT|PATCH|DELETE)\s*\(/.test(content)) {
    errors.push("Healthcheck nao deve expor metodos que alteram dados.");
  }

  if (!/Cache-Control/.test(content) || !/no-store/.test(content)) {
    errors.push("Healthcheck precisa responder com Cache-Control: no-store.");
  }

  if (!/findFirst\s*\(/.test(content)) {
    errors.push("Healthcheck deve testar o banco com consulta minima via Prisma ORM.");
  }

  for (const pattern of blockedRawPatterns) {
    if (content.includes(pattern)) {
      errors.push("Healthcheck nao pode usar SQL raw.");
      break;
    }
  }

  if (/error\.message|String\s*\(\s*error|stack|console\.error/.test(content)) {
    errors.push("Healthcheck nao pode expor ou registrar detalhes internos do erro.");
  }

  if (/DATABASE_URL|DIRECT_URL|AUTH_SECRET|TOKEN|PASSWORD|SECRET/.test(content)) {
    errors.push("Healthcheck nao pode referenciar nomes de segredos na resposta ou logica.");
  }

  return errors;
}

function main() {
  let content;

  try {
    content = readFileSync(routePath, "utf8");
  } catch {
    console.error("Healthcheck ausente em src/app/api/health/route.ts.");
    process.exit(1);
  }

  const errors = collectHealthRouteErrors(content);

  if (errors.length > 0) {
    console.error("Healthcheck inseguro ou incompleto.");
    for (const error of errors) {
      console.error(`- ${error}`);
    }
    process.exit(1);
  }

  console.log("OK: healthcheck seguro configurado.");
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  main();
}
