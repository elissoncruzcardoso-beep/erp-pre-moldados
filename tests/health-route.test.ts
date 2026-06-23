import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import path from "node:path";
import { collectHealthRouteErrors } from "../scripts/check-health-route.mjs";

function readHealthRoute() {
  return readFileSync(
    path.join(process.cwd(), "src", "app", "api", "health", "route.ts"),
    "utf8"
  );
}

test("health route is safe for public monitoring", () => {
  const content = readHealthRoute();
  const errors = collectHealthRouteErrors(content);

  assert.deepEqual(errors, []);
  assert.match(content, /export\s+async\s+function\s+GET\s*\(/);
  assert.match(content, /Cache-Control/);
  assert.match(content, /no-store/);
});

test("health route uses Prisma ORM without leaking internal errors", () => {
  const content = readHealthRoute();

  assert.match(content, /findFirst\s*\(/);
  assert.doesNotMatch(content, /error\.message|String\s*\(\s*error|stack|console\.error/);
  assert.doesNotMatch(content, /DATABASE_URL|DIRECT_URL|AUTH_SECRET|TOKEN|PASSWORD|SECRET/);
});

test("health route guard rejects unsafe route content", () => {
  const unsafeRawCall = "$" + "queryRaw";
  const errors = collectHealthRouteErrors(`
    export async function GET() {
      try { await prisma.${unsafeRawCall}\`select 1\`; }
      catch (error) { return Response.json({ error: error.message }); }
    }
  `);

  assert.match(errors.join("\n"), /SQL raw/);
  assert.match(errors.join("\n"), /detalhes internos/);
});
