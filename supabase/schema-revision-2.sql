-- ============================================================================
-- My SIP Portal — Schema & RLS Revision 2 (Intern Own-Supervisor Profile Read)
-- Idempotent migration: safe to run once or multiple times in the Supabase
-- SQL Editor after schema.sql, storage.sql, and schema-revision-1.sql.
-- ============================================================================

-- ----------------------------------------------------------------------------
-- 1. RLS Helper Function: return the logged-in user's supervisor_id
--    SECURITY DEFINER avoids infinite RLS recursion when used inside a
--    SELECT policy on public.profiles (same pattern as public.get_my_role()).
-- ----------------------------------------------------------------------------
create or replace function public.get_my_supervisor_id()
returns uuid
language sql
stable
security definer
set search_path = public
as $$
  select supervisor_id
  from public.profiles
  where id = auth.uid();
$$;

revoke all on function public.get_my_supervisor_id() from public;
grant execute on function public.get_my_supervisor_id() to authenticated, service_role;

-- ----------------------------------------------------------------------------
-- 2. Profiles RLS Policy: allow an intern to read their own supervisor's row
--    Supervisors and coordinators have supervisor_id = null, so this policy
--    exposes only an intern's own assigned supervisor row and nothing else.
-- ----------------------------------------------------------------------------
drop policy if exists "profiles_select_intern_own_supervisor" on public.profiles;
create policy "profiles_select_intern_own_supervisor"
  on public.profiles
  for select
  to authenticated
  using (id = (select public.get_my_supervisor_id()));
