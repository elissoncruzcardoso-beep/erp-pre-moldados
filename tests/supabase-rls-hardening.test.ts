import test from "node:test";
import assert from "node:assert/strict";
import { mkdirSync, mkdtempSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import { collectSupabaseRlsHardeningErrors } from "../scripts/check-supabase-rls-hardening.mjs";

const validSql = `
do $$
begin
  execute format('alter table %I.%I enable row level security', 'public', 'Customer');
end $$;

revoke all privileges on all tables in schema public from anon, authenticated, public;
revoke all privileges on all sequences in schema public from anon, authenticated, public;
revoke all privileges on all functions in schema public from anon, authenticated, public;
alter default privileges in schema public revoke all on tables from anon;
alter default privileges in schema public revoke all on sequences from anon;
alter default privileges in schema public revoke all on functions from anon;
-- auth.uid() precisa de Supabase Auth; do not run this block blindly.
`;

function createFixture(sql: string) {
  const cwd = mkdtempSync(path.join(tmpdir(), "precast-supabase-rls-"));
  const dir = path.join(cwd, "docs", "security");
  mkdirSync(dir, { recursive: true });
  writeFileSync(path.join(dir, "supabase_rls_hardening.sql"), sql, "utf8");
  return cwd;
}

test("supabase RLS hardening accepts server-only lockdown SQL", () => {
  const cwd = createFixture(validSql);
  assert.deepEqual(collectSupabaseRlsHardeningErrors({ cwd }), []);
});

test("supabase RLS hardening blocks active grants to browser roles", () => {
  const cwd = createFixture(`${validSql}\ngrant select on all tables in schema public to anon;\n`);
  const errors = collectSupabaseRlsHardeningErrors({ cwd });
  assert.match(errors.join("\n"), /grant ativo/);
});

test("supabase RLS hardening blocks permissive policies", () => {
  const cwd = createFixture(`${validSql}\ncreate policy open_all on public.\"Customer\" for select to authenticated using (true);\n`);
  const errors = collectSupabaseRlsHardeningErrors({ cwd });
  assert.match(errors.join("\n"), /policy permissiva/);
});
