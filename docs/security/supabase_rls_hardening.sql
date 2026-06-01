-- Supabase RLS hardening scripts for PRECAST ERP.
-- Review before running. Prefer testing in Supabase SQL Editor on staging first.

-- ============================================================
-- 1) AUDIT: public tables with RLS disabled
-- ============================================================

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
order by c.relname;

-- Tables returned with rls_enabled = false must be fixed before exposing the Data API.

-- ============================================================
-- 2) AUDIT: permissive or risky policies
-- ============================================================

select
  schemaname,
  tablename,
  policyname,
  permissive,
  roles,
  cmd,
  qual,
  with_check
from pg_policies
where schemaname = 'public'
  and (
    'anon' = any(roles)
    or 'public' = any(roles)
    or qual in ('true', '(true)')
    or with_check in ('true', '(true)')
  )
order by tablename, policyname;

-- ============================================================
-- 3) AUDIT: grants that expose tables to browser roles
-- ============================================================

select
  grantee,
  table_schema,
  table_name,
  privilege_type
from information_schema.role_table_grants
where table_schema = 'public'
  and grantee in ('anon', 'authenticated')
order by grantee, table_name, privilege_type;

-- ============================================================
-- 4) RECOMMENDED FOR CURRENT ERP ARCHITECTURE
-- Close public Data API access. The app uses Next.js APIs + Prisma.
-- This does NOT add owner policies because the current app does not
-- authenticate browser users with Supabase Auth.
-- ============================================================

do $$
declare
  r record;
begin
  for r in
    select schemaname, tablename
    from pg_tables
    where schemaname = 'public'
      and tablename <> '_prisma_migrations'
  loop
    execute format('alter table %I.%I enable row level security', r.schemaname, r.tablename);
    execute format('revoke all on table %I.%I from anon', r.schemaname, r.tablename);
    execute format('revoke all on table %I.%I from authenticated', r.schemaname, r.tablename);
  end loop;
end $$;

alter default privileges in schema public revoke all on tables from anon;
alter default privileges in schema public revoke all on tables from authenticated;
alter default privileges in schema public revoke all on sequences from anon;
alter default privileges in schema public revoke all on sequences from authenticated;
alter default privileges in schema public revoke all on functions from anon;
alter default privileges in schema public revoke all on functions from authenticated;

-- Optional stricter defense. Test before enabling because FORCE RLS can affect
-- owner roles. Usually not needed while the app accesses Postgres from trusted
-- server-side Prisma only.
--
-- do $$
-- declare
--   r record;
-- begin
--   for r in
--     select schemaname, tablename
--     from pg_tables
--     where schemaname = 'public'
--       and tablename <> '_prisma_migrations'
--   loop
--     execute format('alter table %I.%I force row level security', r.schemaname, r.tablename);
--   end loop;
-- end $$;

-- ============================================================
-- 5) STRICT OWNER-BASED MODEL FOR FUTURE DIRECT SUPABASE AUTH
-- Run ONLY if the ERP starts using Supabase Auth directly from browser clients.
--
-- Requirement:
-- - Each protected table must have owner_id uuid linked to auth.users(id).
-- - Inserts must happen with a Supabase Auth JWT.
-- - Existing rows need a manual backfill before users can see them.
--
-- WARNING:
-- The current ERP User.id is a CUID string, not auth.users.id UUID.
-- Do not run this block blindly in production today.
-- ============================================================

-- Example for one table:
--
-- alter table public."Customer"
--   add column if not exists owner_id uuid references auth.users(id) on delete restrict;
--
-- alter table public."Customer"
--   alter column owner_id set default auth.uid();
--
-- alter table public."Customer" enable row level security;
--
-- drop policy if exists "customer_owner_select" on public."Customer";
-- drop policy if exists "customer_owner_insert" on public."Customer";
-- drop policy if exists "customer_owner_update" on public."Customer";
-- drop policy if exists "customer_owner_delete" on public."Customer";
--
-- create policy "customer_owner_select"
-- on public."Customer"
-- for select
-- to authenticated
-- using (
--   auth.uid() is not null
--   and owner_id = auth.uid()
-- );
--
-- create policy "customer_owner_insert"
-- on public."Customer"
-- for insert
-- to authenticated
-- with check (
--   auth.uid() is not null
--   and owner_id = auth.uid()
-- );
--
-- create policy "customer_owner_update"
-- on public."Customer"
-- for update
-- to authenticated
-- using (
--   auth.uid() is not null
--   and owner_id = auth.uid()
-- )
-- with check (
--   auth.uid() is not null
--   and owner_id = auth.uid()
-- );
--
-- create policy "customer_owner_delete"
-- on public."Customer"
-- for delete
-- to authenticated
-- using (
--   auth.uid() is not null
--   and owner_id = auth.uid()
-- );

-- Dynamic template for tables that already have owner_id uuid:
--
-- do $$
-- declare
--   r record;
--   has_owner boolean;
-- begin
--   for r in
--     select t.schemaname, t.tablename
--     from pg_tables t
--     where t.schemaname = 'public'
--       and t.tablename <> '_prisma_migrations'
--   loop
--     select exists (
--       select 1
--       from information_schema.columns c
--       where c.table_schema = r.schemaname
--         and c.table_name = r.tablename
--         and c.column_name = 'owner_id'
--         and c.udt_name = 'uuid'
--     ) into has_owner;
--
--     if has_owner then
--       execute format('alter table %I.%I enable row level security', r.schemaname, r.tablename);
--
--       execute format('drop policy if exists %I on %I.%I', r.tablename || '_owner_select', r.schemaname, r.tablename);
--       execute format('drop policy if exists %I on %I.%I', r.tablename || '_owner_insert', r.schemaname, r.tablename);
--       execute format('drop policy if exists %I on %I.%I', r.tablename || '_owner_update', r.schemaname, r.tablename);
--       execute format('drop policy if exists %I on %I.%I', r.tablename || '_owner_delete', r.schemaname, r.tablename);
--
--       execute format(
--         'create policy %I on %I.%I for select to authenticated using (auth.uid() is not null and owner_id = auth.uid())',
--         r.tablename || '_owner_select', r.schemaname, r.tablename
--       );
--       execute format(
--         'create policy %I on %I.%I for insert to authenticated with check (auth.uid() is not null and owner_id = auth.uid())',
--         r.tablename || '_owner_insert', r.schemaname, r.tablename
--       );
--       execute format(
--         'create policy %I on %I.%I for update to authenticated using (auth.uid() is not null and owner_id = auth.uid()) with check (auth.uid() is not null and owner_id = auth.uid())',
--         r.tablename || '_owner_update', r.schemaname, r.tablename
--       );
--       execute format(
--         'create policy %I on %I.%I for delete to authenticated using (auth.uid() is not null and owner_id = auth.uid())',
--         r.tablename || '_owner_delete', r.schemaname, r.tablename
--       );
--     end if;
--   end loop;
-- end $$;
