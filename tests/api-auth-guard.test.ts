import test from "node:test";
import assert from "node:assert/strict";
import { mkdirSync, mkdtempSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import { collectApiAuthGuardErrors } from "../scripts/check-api-auth-guards.mjs";

function writeRoute(cwd: string, relativeFile: string, content: string) {
  const file = path.join(cwd, relativeFile);
  mkdirSync(path.dirname(file), { recursive: true });
  writeFileSync(file, content, "utf8");
}

test("API auth guard blocks mutable route without requireApiSession", async () => {
  const cwd = mkdtempSync(path.join(tmpdir(), "precast-api-auth-"));
  writeRoute(
    cwd,
    "src/app/api/produtos/route.ts",
    "export async function POST() { return Response.json({ ok: true }); }\n"
  );

  const errors = await collectApiAuthGuardErrors({ cwd });

  assert.match(errors.join("\n"), /requireApiSession/);
});

test("API auth guard accepts mutable route with requireApiSession", async () => {
  const cwd = mkdtempSync(path.join(tmpdir(), "precast-api-auth-"));
  writeRoute(
    cwd,
    "src/app/api/produtos/route.ts",
    "import { requireApiSession } from '@/lib/auth/guards';\nexport async function POST() { await requireApiSession({ permission: 'produtos.manage' }); return Response.json({ ok: true }); }\n"
  );

  const errors = await collectApiAuthGuardErrors({ cwd });

  assert.deepEqual(errors, []);
});

test("API auth guard accepts explicit public webhook allowlist", async () => {
  const cwd = mkdtempSync(path.join(tmpdir(), "precast-api-auth-"));
  writeRoute(
    cwd,
    "src/app/api/bot/telegram/route.ts",
    "export async function POST() { return Response.json({ ok: true }); }\n"
  );

  const errors = await collectApiAuthGuardErrors({ cwd });

  assert.deepEqual(errors, []);
});
