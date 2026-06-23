import test from "node:test";
import assert from "node:assert/strict";
import {
  collectSupabaseLiveRlsErrors,
  getAuditDatabaseUrl
} from "../scripts/check-supabase-live-rls.mjs";

test("live RLS audit accepts server-only Supabase posture", () => {
  const errors = collectSupabaseLiveRlsErrors({
    tables: [{ schema_name: "public", table_name: "Customer", rls_enabled: true }],
    policies: [],
    tableGrants: [],
    usageGrants: [],
    functions: []
  });

  assert.deepEqual(errors, []);
});

test("live RLS audit blocks disabled RLS", () => {
  const errors = collectSupabaseLiveRlsErrors({
    tables: [{ schema_name: "public", table_name: "Customer", rls_enabled: false }]
  });

  assert.match(errors.join("\n"), /RLS desligado/);
});

test("live RLS audit blocks table grants to browser roles", () => {
  const errors = collectSupabaseLiveRlsErrors({
    tableGrants: [{ grantee: "anon", schema_name: "public", table_name: "Customer", privilege_type: "SELECT" }]
  });

  assert.match(errors.join("\n"), /Grant de tabela/);
});

test("live RLS audit blocks permissive policies", () => {
  const errors = collectSupabaseLiveRlsErrors({
    policies: [{ schemaname: "public", tablename: "Customer", policyname: "open", roles: "{authenticated}", qual: "true" }]
  });

  assert.match(errors.join("\n"), /Policy exposta/);
  assert.match(errors.join("\n"), /Policy permissiva TRUE/);
});

test("live RLS audit blocks public function execution", () => {
  const errors = collectSupabaseLiveRlsErrors({
    functions: [{ schema_name: "public", function_name: "unsafe_fn", arguments: "", anon_execute: true, authenticated_execute: false }]
  });

  assert.match(errors.join("\n"), /Funcao executavel por anon/);
});

test("audit database URL prefers dedicated read-only URL", () => {
  const url = getAuditDatabaseUrl({
    SUPABASE_AUDIT_DATABASE_URL: "postgresql://audit:secret@db.example.com:5432/postgres",
    DIRECT_URL: "postgresql://direct:secret@db.example.com:5432/postgres",
    DATABASE_URL: "postgresql://app:secret@db.example.com:5432/postgres"
  });

  assert.match(url, /^postgresql:\/\/audit:/);
});
