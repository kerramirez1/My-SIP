-- ============================================================================
-- My SIP Portal — Schema Revision 9 (Daily Accomplishment Entries, Weekly
-- Reflections, and Complete On-Campus / Off-Campus Placement Information)
-- Idempotent migration: safe to run once or multiple times in the Supabase
-- SQL Editor after schema.sql, storage.sql, and schema-revision-1..8.sql.
--
-- Backward compatibility:
-- - Existing public.profiles.company_name is preserved as the storage column
--   for "Host Organization / Institution" so zero existing placement data is
--   lost or broken.
-- - New columns on public.profiles (year_level, internship_type,
--   department_office, internship_end_date) are nullable.
-- - New columns on public.accomplishments (entry_date, output_result) are
--   nullable so all historical/legacy weekly entries remain intact and
--   detectable without altering or deleting any submitted record.
-- - Existing reflection fields on public.accomplishments (skills_acquired,
--   challenges_encountered, lessons_learned) are preserved intact and
--   non-destructively backfilled into public.weekly_accomplishment_reflections
--   (one row per intern + reporting week) so new weekly reports capture
--   reflection once per week instead of duplicating it across daily rows.
-- ============================================================================

-- ----------------------------------------------------------------------------
-- 1. PROFILES — year level, internship type, office/department, end date
-- ----------------------------------------------------------------------------
alter table public.profiles
  add column if not exists year_level text,
  add column if not exists internship_type text,
  add column if not exists department_office text,
  add column if not exists internship_end_date date;

do $$
begin
  if not exists (
    select 1
    from pg_constraint
    where conname = 'profiles_internship_type_valid'
      and conrelid = 'public.profiles'::regclass
  ) then
    alter table public.profiles
      add constraint profiles_internship_type_valid
      check (internship_type is null or internship_type in ('on_campus', 'off_campus'));
  end if;

  if not exists (
    select 1
    from pg_constraint
    where conname = 'profiles_internship_dates_valid'
      and conrelid = 'public.profiles'::regclass
  ) then
    alter table public.profiles
      add constraint profiles_internship_dates_valid
      check (
        internship_end_date is null
        or internship_start_date is null
        or internship_end_date >= internship_start_date
      );
  end if;
end
$$;

-- Extend self-update guard trigger so coordinator-owned placement fields
-- cannot be modified through self-service profile updates.
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
      or new.internship_end_date is distinct from old.internship_end_date
      or new.student_id_no is distinct from old.student_id_no
      or new.school_name is distinct from old.school_name
      or new.course is distinct from old.course
      or new.year_level is distinct from old.year_level
      or new.internship_type is distinct from old.internship_type
      or new.company_name is distinct from old.company_name
      or new.department_office is distinct from old.department_office
      or new.is_active is distinct from old.is_active
      or new.deactivated_at is distinct from old.deactivated_at
      or new.deactivated_by is distinct from old.deactivated_by
      or new.deactivated_reason is distinct from old.deactivated_reason
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

-- ----------------------------------------------------------------------------
-- 2. ACCOMPLISHMENTS — daily entry_date (Mon-Sat) and output_result
-- ----------------------------------------------------------------------------
alter table public.accomplishments
  add column if not exists entry_date date,
  add column if not exists output_result text;

do $$
begin
  if not exists (
    select 1
    from pg_constraint
    where conname = 'accomplishments_entry_date_in_week'
      and conrelid = 'public.accomplishments'::regclass
  ) then
    alter table public.accomplishments
      add constraint accomplishments_entry_date_in_week
      check (
        entry_date is null
        or (entry_date >= week_of and entry_date <= (week_of + 5))
      );
  end if;
end
$$;

-- One daily row per intern per calendar date (legacy rows with entry_date IS NULL
-- remain unaffected and can coexist without conflict).
create unique index if not exists idx_accomplishments_intern_entry_date_unique
  on public.accomplishments (intern_id, entry_date)
  where entry_date is not null;

create index if not exists idx_accomplishments_intern_week_date
  on public.accomplishments (intern_id, week_of, entry_date);

-- ----------------------------------------------------------------------------
-- 3. WEEKLY ACCOMPLISHMENT REFLECTIONS — one reflection record per (intern, week)
-- ----------------------------------------------------------------------------
create table if not exists public.weekly_accomplishment_reflections (
  id uuid primary key default gen_random_uuid(),
  intern_id uuid not null references public.profiles (id) on delete restrict,
  week_of date not null,
  skills_acquired text,
  challenges_encountered text,
  lessons_learned text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint weekly_accomplishment_reflections_intern_week_unique unique (intern_id, week_of)
);

drop trigger if exists trg_weekly_accomplishment_reflections_updated_at
  on public.weekly_accomplishment_reflections;
create trigger trg_weekly_accomplishment_reflections_updated_at
  before update on public.weekly_accomplishment_reflections
  for each row
  execute function public.set_updated_at();

-- Non-destructive backfill of legacy reflection fields from public.accomplishments
-- without modifying or deleting any existing accomplishment rows.
insert into public.weekly_accomplishment_reflections (
  intern_id,
  week_of,
  skills_acquired,
  challenges_encountered,
  lessons_learned,
  created_at,
  updated_at
)
select distinct on (a.intern_id, a.week_of)
  a.intern_id,
  a.week_of,
  nullif(trim(a.skills_acquired), ''),
  nullif(trim(a.challenges_encountered), ''),
  nullif(trim(a.lessons_learned), ''),
  a.created_at,
  a.updated_at
from public.accomplishments a
where nullif(trim(a.skills_acquired), '') is not null
   or nullif(trim(a.challenges_encountered), '') is not null
   or nullif(trim(a.lessons_learned), '') is not null
order by a.intern_id, a.week_of, a.updated_at desc, a.created_at desc
on conflict (intern_id, week_of) do nothing;

alter table public.weekly_accomplishment_reflections enable row level security;

drop policy if exists "weekly_reflections_intern_select_own"
  on public.weekly_accomplishment_reflections;
create policy "weekly_reflections_intern_select_own"
  on public.weekly_accomplishment_reflections
  for select
  to authenticated
  using (
    (select public.get_my_role()) = 'intern'
    and intern_id = (select auth.uid())
  );

drop policy if exists "weekly_reflections_intern_insert_own"
  on public.weekly_accomplishment_reflections;
create policy "weekly_reflections_intern_insert_own"
  on public.weekly_accomplishment_reflections
  for insert
  to authenticated
  with check (
    (select public.get_my_role()) = 'intern'
    and intern_id = (select auth.uid())
  );

drop policy if exists "weekly_reflections_intern_update_own"
  on public.weekly_accomplishment_reflections;
create policy "weekly_reflections_intern_update_own"
  on public.weekly_accomplishment_reflections
  for update
  to authenticated
  using (
    (select public.get_my_role()) = 'intern'
    and intern_id = (select auth.uid())
  )
  with check (
    (select public.get_my_role()) = 'intern'
    and intern_id = (select auth.uid())
  );

drop policy if exists "weekly_reflections_supervisor_select_assigned"
  on public.weekly_accomplishment_reflections;
create policy "weekly_reflections_supervisor_select_assigned"
  on public.weekly_accomplishment_reflections
  for select
  to authenticated
  using (
    (select public.get_my_role()) = 'supervisor'
    and exists (
      select 1
      from public.profiles p
      where p.id = weekly_accomplishment_reflections.intern_id
        and p.role = 'intern'
        and p.supervisor_id = (select auth.uid())
    )
  );

drop policy if exists "weekly_reflections_coordinator_select_all"
  on public.weekly_accomplishment_reflections;
create policy "weekly_reflections_coordinator_select_all"
  on public.weekly_accomplishment_reflections
  for select
  to authenticated
  using ((select public.get_my_role()) = 'coordinator');

drop policy if exists "weekly_reflections_coordinator_delete_only"
  on public.weekly_accomplishment_reflections;
create policy "weekly_reflections_coordinator_delete_only"
  on public.weekly_accomplishment_reflections
  for delete
  to authenticated
  using ((select public.get_my_role()) = 'coordinator');

-- Explicit grants for Data API exposure
revoke all on public.weekly_accomplishment_reflections from public, anon, authenticated;
grant select, insert, update, delete on public.weekly_accomplishment_reflections
  to authenticated, service_role;

-- ----------------------------------------------------------------------------
-- 4. EXTEND SAFE DELETE GUARD ON public.profiles TO COVER WEEKLY REFLECTIONS
-- ----------------------------------------------------------------------------
create or replace function public.guard_profile_delete_no_history()
returns trigger
language plpgsql
set search_path = public
as $$
declare
  v_active_coordinators integer;
begin
  if old.role = 'coordinator' and old.is_active = true then
    select count(*)
      into v_active_coordinators
      from public.profiles
      where role = 'coordinator'
        and is_active = true
        and id <> old.id;

    if v_active_coordinators = 0 then
      raise exception 'Cannot delete the last active SIP Coordinator account.'
        using errcode = 'P0001';
    end if;
  end if;

  if exists (
    select 1 from public.weekly_attendance
    where intern_id = old.id or reviewed_by = old.id
  )
  or exists (
    select 1 from public.accomplishments
    where intern_id = old.id or reviewed_by = old.id
  )
  or exists (
    select 1 from public.weekly_accomplishment_reflections
    where intern_id = old.id
  )
  or exists (
    select 1 from public.tasks
    where intern_id = old.id or assigned_by = old.id or reviewed_by = old.id
  )
  or exists (
    select 1 from public.profiles
    where supervisor_id = old.id
  ) then
    raise exception 'Cannot permanently delete account with existing internship records or assignments. Deactivate the account instead.'
      using errcode = '23503';
  end if;

  return old;
end;
$$;

drop trigger if exists profiles_guard_delete_no_history on public.profiles;
create trigger profiles_guard_delete_no_history
  before delete on public.profiles
  for each row
  execute function public.guard_profile_delete_no_history();
