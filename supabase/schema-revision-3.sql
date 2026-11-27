-- ============================================================================
-- My SIP Portal — Schema Revision 3 (Guard Coordinator-Owned Profile Fields)
-- Idempotent migration: safe to run once or multiple times in the Supabase
-- SQL Editor after schema.sql, storage.sql, schema-revision-1.sql, and
-- schema-revision-2.sql.
--
-- Behavior:
-- - Protects coordinator-owned columns on public.profiles (role, supervisor_id,
--   required_hours, internship_start_date, student_id_no, school_name, course,
--   company_name) from self-service updates via profiles_update_own.
-- - full_name remains self-editable by the signed-in user.
-- - Service-role flows (such as the create-account Edge Function and
--   scripts/seed-accounts.mjs) are unaffected because auth.uid() is null for
--   service-role connections; this guard fires only when auth.uid() is not
--   null and matches the row's own id.
-- ============================================================================

create or replace function public.guard_profile_coordinator_fields()
returns trigger
language plpgsql
set search_path = public
as $$
begin
  if auth.uid() is not null and auth.uid() = old.id then
    if new.role is distinct from old.role
      or new.supervisor_id is distinct from old.supervisor_id
      or new.required_hours is distinct from old.required_hours
      or new.internship_start_date is distinct from old.internship_start_date
      or new.student_id_no is distinct from old.student_id_no
      or new.school_name is distinct from old.school_name
      or new.course is distinct from old.course
      or new.company_name is distinct from old.company_name
    then
      raise exception 'These profile details are set by the SIP Coordinator and cannot be changed here.';
    end if;
  end if;

  return new;
end;
$$;

drop trigger if exists profiles_guard_coordinator_fields on public.profiles;
create trigger profiles_guard_coordinator_fields
  before update on public.profiles
  for each row
  execute function public.guard_profile_coordinator_fields();
