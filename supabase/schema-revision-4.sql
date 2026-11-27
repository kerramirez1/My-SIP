-- ============================================================================
-- My SIP Portal — Schema Revision 4 (Safe Account Lifecycle, Non-Cascading
-- Historical Record Protection & Immutable Account Audit Trail)
-- Idempotent migration: safe to run once or multiple times after schema.sql,
-- storage.sql, and schema-revision-1..3.sql.
-- ============================================================================

-- ----------------------------------------------------------------------------
-- 1. PROFILES — account activation status and deactivation metadata
-- ----------------------------------------------------------------------------
alter table public.profiles
  add column if not exists is_active boolean not null default true,
  add column if not exists deactivated_at timestamptz,
  add column if not exists deactivated_by uuid references public.profiles (id) on delete set null,
  add column if not exists deactivated_reason text;

create index if not exists idx_profiles_role_active
  on public.profiles (role, is_active);

create index if not exists idx_profiles_deactivated_by
  on public.profiles (deactivated_by);

-- Foreign-key indexes for fast historical record lookups and safe delete checks
create index if not exists idx_weekly_attendance_reviewed_by
  on public.weekly_attendance (reviewed_by);

create index if not exists idx_accomplishments_reviewed_by
  on public.accomplishments (reviewed_by);

create index if not exists idx_tasks_reviewed_by
  on public.tasks (reviewed_by);

-- ----------------------------------------------------------------------------
-- 2. REPLACE ON DELETE CASCADE -> ON DELETE RESTRICT ON HISTORICAL TABLES
--    Guarantees no accidental cascading delete can wipe internship records.
-- ----------------------------------------------------------------------------
do $$
declare
  v_conname text;
begin
  -- weekly_attendance.intern_id
  select c.conname into v_conname
  from pg_constraint c
  join pg_attribute a on a.attrelid = c.conrelid and a.attnum = any(c.conkey)
  where c.conrelid = 'public.weekly_attendance'::regclass
    and c.contype = 'f'
    and a.attname = 'intern_id'
    and c.confdeltype <> 'r'
  limit 1;

  if v_conname is not null then
    execute format('alter table public.weekly_attendance drop constraint %I', v_conname);
    alter table public.weekly_attendance
      add constraint weekly_attendance_intern_id_fkey
      foreign key (intern_id) references public.profiles (id) on delete restrict;
  end if;

  -- accomplishments.intern_id
  v_conname := null;
  select c.conname into v_conname
  from pg_constraint c
  join pg_attribute a on a.attrelid = c.conrelid and a.attnum = any(c.conkey)
  where c.conrelid = 'public.accomplishments'::regclass
    and c.contype = 'f'
    and a.attname = 'intern_id'
    and c.confdeltype <> 'r'
  limit 1;

  if v_conname is not null then
    execute format('alter table public.accomplishments drop constraint %I', v_conname);
    alter table public.accomplishments
      add constraint accomplishments_intern_id_fkey
      foreign key (intern_id) references public.profiles (id) on delete restrict;
  end if;

  -- tasks.intern_id
  v_conname := null;
  select c.conname into v_conname
  from pg_constraint c
  join pg_attribute a on a.attrelid = c.conrelid and a.attnum = any(c.conkey)
  where c.conrelid = 'public.tasks'::regclass
    and c.contype = 'f'
    and a.attname = 'intern_id'
    and c.confdeltype <> 'r'
  limit 1;

  if v_conname is not null then
    execute format('alter table public.tasks drop constraint %I', v_conname);
    alter table public.tasks
      add constraint tasks_intern_id_fkey
      foreign key (intern_id) references public.profiles (id) on delete restrict;
  end if;
end
$$;

-- ----------------------------------------------------------------------------
-- 3. RLS HELPER: deactivated accounts lose all role-scoped RLS access instantly
--    (profiles_select_own remains active so the UI can show a clear message)
-- ----------------------------------------------------------------------------
create or replace function public.get_my_role()
returns public.user_role
language sql
stable
security definer
set search_path = public
as $$
  select role
  from public.profiles
  where id = auth.uid()
    and is_active = true;
$$;

revoke all on function public.get_my_role() from public;
grant execute on function public.get_my_role() to authenticated, service_role;

-- ----------------------------------------------------------------------------
-- 4. EXTEND SELF-UPDATE GUARD TRIGGER TO PROTECT ACCOUNT STATUS FIELDS
-- ----------------------------------------------------------------------------
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
-- 5. DATABASE-LEVEL SAFE DELETE GUARD ON public.profiles
--    Blocks deletion when ANY historical record, review, task assignment, or
--    supervisor assignment exists, or when deleting the last active coordinator.
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

-- Remove direct browser-side profile delete policy so all account deletions go
-- through the privileged server-side manage-account Edge Function (keeping
-- auth.users and public.profiles strictly atomic).
drop policy if exists "profiles_delete_coordinator_only" on public.profiles;

-- ----------------------------------------------------------------------------
-- 6. IMMUTABLE ACCOUNT AUDIT TRAIL TABLE
--    Stores denormalized snapshots of target identity so audit records survive
--    permanently even after an account is deactivated or permanently deleted.
-- ----------------------------------------------------------------------------
create table if not exists public.account_audit_logs (
  id uuid primary key default gen_random_uuid(),
  action text not null,
  target_user_id uuid not null,
  target_name text not null,
  target_email text,
  target_role public.user_role not null,
  performed_by uuid references public.profiles (id) on delete set null,
  performed_by_name text not null,
  reason text,
  metadata jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now()
);

do $$
begin
  if not exists (
    select 1
    from pg_constraint
    where conname = 'account_audit_logs_action_valid'
      and conrelid = 'public.account_audit_logs'::regclass
  ) then
    alter table public.account_audit_logs
      add constraint account_audit_logs_action_valid
      check (action in ('created', 'updated', 'deactivated', 'reactivated', 'deleted'));
  end if;
end
$$;

create index if not exists idx_account_audit_logs_created_at
  on public.account_audit_logs (created_at desc);

create index if not exists idx_account_audit_logs_target_user_id
  on public.account_audit_logs (target_user_id);

create index if not exists idx_account_audit_logs_performed_by
  on public.account_audit_logs (performed_by);

alter table public.account_audit_logs enable row level security;

drop policy if exists "account_audit_logs_coordinator_select_all" on public.account_audit_logs;
create policy "account_audit_logs_coordinator_select_all"
  on public.account_audit_logs
  for select
  to authenticated
  using ((select public.get_my_role()) = 'coordinator');

-- Explicit grants (required for Data API exposure; authenticated is SELECT-only
-- so audit logs cannot be fabricated, edited, or deleted from browser clients)
revoke all on public.account_audit_logs from public, anon, authenticated;
grant select on public.account_audit_logs to authenticated;
grant select, insert, update, delete on public.account_audit_logs to service_role;
