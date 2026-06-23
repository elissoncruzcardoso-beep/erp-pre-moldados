import dotenv from "dotenv";
import pg from "pg";
import path from "node:path";
import { fileURLToPath } from "node:url";

const { Client } = pg;
const browserRoles = new Set(["anon", "authenticated", "public", "PUBLIC"]);

function loadLocalEnv() {
  dotenv.config({ path: path.resolve(process.cwd(), ".env.local"), override: false });
  dotenv.config({ path: path.resolve(process.cwd(), ".env"), override: false });
}

function normalizeBoolean(value) {
  return value === true || value === "true" || value === "t";
}

function normalizeRoles(roles) {
  if (Array.isArray(roles)) return roles.map(String);
  if (!roles) return [];

  return String(roles)
    .replace(/[{}]/g, "")
    .split(",")
    .map((role) => role.trim().replace(/^"|"$/g, ""))
    .filter(Boolean);
}

function normalizeExpression(expression) {
  return String(expression ?? "")
    .replace(/[()"'\s;]/g, "")
    .toLowerCase();
}

function isTrueExpression(expression) {
  const normalized = normalizeExpression(expression);
  return normalized === "true" || normalized === "booltrue";
}

function formatObjectName(row) {
  return [row.schema_name || row.schemaname || row.table_schema || "public", row.table_name || row.tablename || row.object_name || row.function_name]
    .filter(Boolean)
    .join(".");
}

export function collectSupabaseLiveRlsErrors({
  tables = [],
  policies = [],
  tableGrants = [],
  usageGrants = [],
  functions = []
} = {}) {
  const errors = [];

  for (const table of tables) {
    if (table.table_name === "_prisma_migrations") continue;
    if (!normalizeBoolean(table.rls_enabled)) {
      errors.push(`RLS desligado em ${formatObjectName(table)}.`);
    }
  }

  for (const grant of tableGrants) {
    if (browserRoles.has(String(grant.grantee))) {
      errors.push(`Grant de tabela exposto para ${grant.grantee}: ${formatObjectName(grant)} (${grant.privilege_type}).`);
    }
  }

  for (const grant of usageGrants) {
    if (browserRoles.has(String(grant.grantee))) {
      errors.push(`Grant de uso exposto para ${grant.grantee}: ${formatObjectName(grant)} (${grant.object_type}/${grant.privilege_type}).`);
    }
  }

  for (const policy of policies) {
    const roles = normalizeRoles(policy.roles);
    const exposedRole = roles.find((role) => browserRoles.has(role));

    if (exposedRole) {
      errors.push(`Policy exposta para ${exposedRole}: ${formatObjectName(policy)}.${policy.policyname || policy.policy_name}.`);
    }

    if (isTrueExpression(policy.qual) || isTrueExpression(policy.with_check)) {
      errors.push(`Policy permissiva TRUE: ${formatObjectName(policy)}.${policy.policyname || policy.policy_name}.`);
    }
  }

  for (const fn of functions) {
    if (normalizeBoolean(fn.anon_execute)) {
      errors.push(`Funcao executavel por anon: ${formatObjectName(fn)}(${fn.arguments || ""}).`);
    }

    if (normalizeBoolean(fn.authenticated_execute)) {
      errors.push(`Funcao executavel por authenticated: ${formatObjectName(fn)}(${fn.arguments || ""}).`);
    }

    if (normalizeBoolean(fn.security_definer) && (normalizeBoolean(fn.anon_execute) || normalizeBoolean(fn.authenticated_execute))) {
      errors.push(`Funcao SECURITY DEFINER exposta: ${formatObjectName(fn)}(${fn.arguments || ""}).`);
    }
  }

  return errors;
}

export function getAuditDatabaseUrl(env = process.env) {
  return env.SUPABASE_AUDIT_DATABASE_URL || env.DIRECT_URL || env.DATABASE_URL || "";
}

function getConnectionLabel(connectionString) {
  try {
    const url = new URL(connectionString);
    return `${url.protocol}//${url.username ? "<user>" : ""}@${url.hostname}${url.port ? `:${url.port}` : ""}${url.pathname}`;
  } catch {
    return "<url invalida>";
  }
}

function shouldUseSsl(connectionString) {
  try {
    const url = new URL(connectionString);
    return url.hostname.includes("supabase.co") || url.hostname.includes("pooler.supabase.com");
  } catch {
    return false;
  }
}

export async function runSupabaseLiveRlsAudit({ connectionString }) {
  const client = new Client({
    connectionString,
    ssl: shouldUseSsl(connectionString) ? { rejectUnauthorized: false } : undefined
  });

  await client.connect();

  try {
    const tables = await client.query(`
      select
        n.nspname as schema_name,
        c.relname as table_name,
        c.relrowsecurity as rls_enabled,
        c.relforcerowsecurity as rls_forced
      from pg_class c
      join pg_namespace n on n.oid = c.relnamespace
      where c.relkind in ('r', 'p')
        and n.nspname = 'public'
        and c.relname <> '_prisma_migrations'
      order by c.relname
    `);

    const policies = await client.query(`
      select
        schemaname,
        tablename,
        policyname,
        roles::text as roles,
        cmd,
        qual,
        with_check
      from pg_policies
      where schemaname = 'public'
      order by tablename, policyname
    `);

    const tableGrants = await client.query(`
      select
        grantee,
        table_schema as schema_name,
        table_name,
        privilege_type
      from information_schema.role_table_grants
      where table_schema = 'public'
        and grantee in ('anon', 'authenticated', 'PUBLIC')
      order by grantee, table_name, privilege_type
    `);

    const usageGrants = await client.query(`
      select
        grantee,
        object_schema as schema_name,
        object_name,
        object_type,
        privilege_type
      from information_schema.usage_privileges
      where object_schema = 'public'
        and grantee in ('anon', 'authenticated', 'PUBLIC')
      order by grantee, object_type, object_name, privilege_type
    `);

    const functions = await client.query(`
      select
        n.nspname as schema_name,
        p.proname as function_name,
        pg_get_function_identity_arguments(p.oid) as arguments,
        p.prosecdef as security_definer,
        has_function_privilege('anon', p.oid, 'EXECUTE') as anon_execute,
        has_function_privilege('authenticated', p.oid, 'EXECUTE') as authenticated_execute
      from pg_proc p
      join pg_namespace n on n.oid = p.pronamespace
      where n.nspname = 'public'
      order by p.proname, arguments
    `);

    return {
      tables: tables.rows,
      policies: policies.rows,
      tableGrants: tableGrants.rows,
      usageGrants: usageGrants.rows,
      functions: functions.rows
    };
  } finally {
    await client.end();
  }
}

const isMain = process.argv[1] && path.resolve(process.argv[1]) === path.resolve(fileURLToPath(import.meta.url));

async function main() {
  loadLocalEnv();

  const connectionString = getAuditDatabaseUrl();
  if (!connectionString) {
    console.error("Configure SUPABASE_AUDIT_DATABASE_URL, DIRECT_URL ou DATABASE_URL para auditar o Supabase.");
    process.exit(1);
  }

  console.log(`Auditando Supabase/Postgres em ${getConnectionLabel(connectionString)}.`);

  const result = await runSupabaseLiveRlsAudit({ connectionString });
  const errors = collectSupabaseLiveRlsErrors(result);

  if (errors.length > 0) {
    console.error("Falha na auditoria live do Supabase RLS.");
    for (const error of errors) {
      console.error(`- ${error}`);
    }
    process.exit(1);
  }

  console.log(`OK: ${result.tables.length} tabela(s) publicas com RLS e sem grants/policies expostas.`);
}

if (isMain) {
  main().catch((error) => {
    console.error("Falha ao auditar Supabase RLS.");
    console.error(error instanceof Error ? error.message : String(error));
    process.exit(1);
  });
}
