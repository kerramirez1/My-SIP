-- ============================================================================
-- My SIP Portal — Complete Initial Database Schema & Row Level Security (RLS)
-- Run once in the Supabase SQL Editor.
-- ============================================================================

-- ----------------------------------------------------------------------------
-- 1. Custom Enum Types
-- ----------------------------------------------------------------------------
do $$
begin
  if not exists (
    select 1
    from pg_type t
    join pg_namespace n on n.oid = t.typnamespace
    where n.nspname = 'public' and t.typname = 'user_role'
  ) then
    create type public.user_role as enum ('intern', 'supervisor', 'coordinator');
  end if;

  if not exists (
    select 1
    from pg_type t
    join pg_namespace n on n.oid = t.typnamespace
    where n.nspname = 'public' and t.typname = 'submission_status'
  ) then
    create type public.submission_status as enum ('pending', 'approved', 'returned');
  end if;
end
$$;

-- ----------------------------------------------------------------------------
-- 2. Timestamp Maintenance Trigger Function
-- ----------------------------------------------------------------------------
create or replace function public.set_updated_at()
returns trigger
language plpgsql
set search_path = public
as $$
begin
  new.updated_at = now();
  return new;
end;
$$;

-- ----------------------------------------------------------------------------
-- 3. Tables
-- ----------------------------------------------------------------------------

-- 3.1 profiles (one row per Supabase Auth user)
create table if not exists public.profiles (
  id uuid primary key references auth.users (id) on delete cascade,
  full_name text not null,
  role public.user_role not null default 'intern',
  supervisor_id uuid references public.profiles (id) on delete set null,
  student_id_no text,
  company_name text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint profiles_no_self_supervisor check (supervisor_id is null or supervisor_id <> id)
);

-- 3.2 weekly_attendance (one row per intern per day)
create table if not exists public.weekly_attendance (
  id uuid primary key default gen_random_uuid(),
  intern_id uuid not null references public.profiles (id) on delete cascade,
  attendance_date date not null,
  time_in time,
  time_out time,
  week_of date not null,
  status public.submission_status not null default 'pending',
  reviewed_by uuid references public.profiles (id) on delete set null,
  reviewer_remarks text,
  reviewed_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint weekly_attendance_intern_date_unique unique (intern_id, attendance_date)
);

-- 3.3 accomplishments (one row per weekly/accomplishment submission)
create table if not exists public.accomplishments (
  id uuid primary key default gen_random_uuid(),
  intern_id uuid not null references public.profiles (id) on delete cascade,
  week_of date not null,
  title text not null,
  description text,
  attachment_url text,
  status public.submission_status not null default 'pending',
  reviewed_by uuid references public.profiles (id) on delete set null,
  reviewer_remarks text,
  reviewed_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

-- 3.4 tasks (one row per task submitted by the intern)
create table if not exists public.tasks (
  id uuid primary key default gen_random_uuid(),
  intern_id uuid not null references public.profiles (id) on delete cascade,
  title text not null,
  description text,
  task_date date not null,
  status public.submission_status not null default 'pending',
  reviewed_by uuid references public.profiles (id) on delete set null,
  reviewer_remarks text,
  reviewed_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

-- Indexes for lookups and RLS checks
create index if not exists idx_profiles_supervisor_id on public.profiles (supervisor_id);
create index if not exists idx_profiles_role on public.profiles (role);
create index if not exists idx_weekly_attendance_intern_week on public.weekly_attendance (intern_id, week_of);
create index if not exists idx_weekly_attendance_status on public.weekly_attendance (status);
create index if not exists idx_accomplishments_intern_week on public.accomplishments (intern_id, week_of);
create index if not exists idx_accomplishments_status on public.accomplishments (status);
create index if not exists idx_tasks_intern_date on public.tasks (intern_id, task_date);
create index if not exists idx_tasks_status on public.tasks (status);

-- updated_at triggers
drop trigger if exists trg_profiles_updated_at on public.profiles;
create trigger trg_profiles_updated_at
  before update on public.profiles
  for each row
  execute function public.set_updated_at();

drop trigger if exists trg_weekly_attendance_updated_at on public.weekly_attendance;
create trigger trg_weekly_attendance_updated_at
  before update on public.weekly_attendance
  for each row
  execute function public.set_updated_at();

drop trigger if exists trg_accomplishments_updated_at on public.accomplishments;
create trigger trg_accomplishments_updated_at
  before update on public.accomplishments
  for each row
  execute function public.set_updated_at();

drop trigger if exists trg_tasks_updated_at on public.tasks;
create trigger trg_tasks_updated_at
  before update on public.tasks
  for each row
  execute function public.set_updated_at();

-- ----------------------------------------------------------------------------
-- 4. Auth Signup Trigger -> Auto-Insert into public.profiles
-- ----------------------------------------------------------------------------
create or replace function public.handle_new_user()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  v_full_name text;
  v_role public.user_role;
begin
  v_full_name := coalesce(
    nullif(trim(new.raw_user_meta_data ->> 'full_name'), ''),
    nullif(split_part(coalesce(new.email, ''), '@', 1), ''),
    'Unnamed User'
  );

  v_role := case
    when (new.raw_user_meta_data ->> 'role') in ('intern', 'supervisor', 'coordinator')
      then (new.raw_user_meta_data ->> 'role')::public.user_role
    else 'intern'::public.user_role
  end;

  insert into public.profiles (id, full_name, role)
  values (new.id, v_full_name, v_role)
  on conflict (id) do nothing;

  return new;
end;
$$;

drop trigger if exists on_auth_user_created on auth.users;
create trigger on_auth_user_created
  after insert on auth.users
  for each row
  execute function public.handle_new_user();

-- ----------------------------------------------------------------------------
-- 5. Row Level Security (RLS) Helper Function
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
  where id = auth.uid();
$$;

revoke all on function public.get_my_role() from public;
grant execute on function public.get_my_role() to authenticated, service_role;

-- ----------------------------------------------------------------------------
-- 6. Enable RLS on All Four Tables
-- ----------------------------------------------------------------------------
alter table public.profiles enable row level security;
alter table public.weekly_attendance enable row level security;
alter table public.accomplishments enable row level security;
alter table public.tasks enable row level security;

-- ----------------------------------------------------------------------------
-- 7. RLS Policies: public.profiles
-- ----------------------------------------------------------------------------
drop policy if exists "profiles_select_own" on public.profiles;
create policy "profiles_select_own"
  on public.profiles
  for select
  to authenticated
  using (id = auth.uid());

drop policy if exists "profiles_select_supervisor_assigned_interns" on public.profiles;
create policy "profiles_select_supervisor_assigned_interns"
  on public.profiles
  for select
  to authenticated
  using (
    public.get_my_role() = 'supervisor'
    and role = 'intern'
    and supervisor_id = auth.uid()
  );

drop policy if exists "profiles_select_coordinator_all" on public.profiles;
create policy "profiles_select_coordinator_all"
  on public.profiles
  for select
  to authenticated
  using (public.get_my_role() = 'coordinator');

drop policy if exists "profiles_update_own" on public.profiles;
create policy "profiles_update_own"
  on public.profiles
  for update
  to authenticated
  using (id = auth.uid())
  with check (
    id = auth.uid()
    and role = public.get_my_role()
  );

drop policy if exists "profiles_delete_coordinator_only" on public.profiles;
create policy "profiles_delete_coordinator_only"
  on public.profiles
  for delete
  to authenticated
  using (public.get_my_role() = 'coordinator');

-- ----------------------------------------------------------------------------
-- 8. RLS Policies: public.weekly_attendance
-- ----------------------------------------------------------------------------
drop policy if exists "weekly_attendance_intern_select_own" on public.weekly_attendance;
create policy "weekly_attendance_intern_select_own"
  on public.weekly_attendance
  for select
  to authenticated
  using (
    public.get_my_role() = 'intern'
    and intern_id = auth.uid()
  );

drop policy if exists "weekly_attendance_intern_insert_own" on public.weekly_attendance;
create policy "weekly_attendance_intern_insert_own"
  on public.weekly_attendance
  for insert
  to authenticated
  with check (
    public.get_my_role() = 'intern'
    and intern_id = auth.uid()
    and status = 'pending'
    and reviewed_by is null
    and reviewed_at is null
  );

drop policy if exists "weekly_attendance_intern_update_own_editable" on public.weekly_attendance;
create policy "weekly_attendance_intern_update_own_editable"
  on public.weekly_attendance
  for update
  to authenticated
  using (
    public.get_my_role() = 'intern'
    and intern_id = auth.uid()
    and status in ('pending', 'returned')
  )
  with check (
    public.get_my_role() = 'intern'
    and intern_id = auth.uid()
    and status in ('pending', 'returned')
  );

drop policy if exists "weekly_attendance_supervisor_select_assigned" on public.weekly_attendance;
create policy "weekly_attendance_supervisor_select_assigned"
  on public.weekly_attendance
  for select
  to authenticated
  using (
    public.get_my_role() = 'supervisor'
    and exists (
      select 1
      from public.profiles p
      where p.id = weekly_attendance.intern_id
        and p.role = 'intern'
        and p.supervisor_id = auth.uid()
    )
  );

drop policy if exists "weekly_attendance_supervisor_update_assigned" on public.weekly_attendance;
create policy "weekly_attendance_supervisor_update_assigned"
  on public.weekly_attendance
  for update
  to authenticated
  using (
    public.get_my_role() = 'supervisor'
    and exists (
      select 1
      from public.profiles p
      where p.id = weekly_attendance.intern_id
        and p.role = 'intern'
        and p.supervisor_id = auth.uid()
    )
  )
  with check (
    public.get_my_role() = 'supervisor'
    and exists (
      select 1
      from public.profiles p
      where p.id = weekly_attendance.intern_id
        and p.role = 'intern'
        and p.supervisor_id = auth.uid()
    )
  );

drop policy if exists "weekly_attendance_coordinator_select_all" on public.weekly_attendance;
create policy "weekly_attendance_coordinator_select_all"
  on public.weekly_attendance
  for select
  to authenticated
  using (public.get_my_role() = 'coordinator');

drop policy if exists "weekly_attendance_coordinator_delete_only" on public.weekly_attendance;
create policy "weekly_attendance_coordinator_delete_only"
  on public.weekly_attendance
  for delete
  to authenticated
  using (public.get_my_role() = 'coordinator');

-- ----------------------------------------------------------------------------
-- 9. RLS Policies: public.accomplishments
-- ----------------------------------------------------------------------------
drop policy if exists "accomplishments_intern_select_own" on public.accomplishments;
create policy "accomplishments_intern_select_own"
  on public.accomplishments
  for select
  to authenticated
  using (
    public.get_my_role() = 'intern'
    and intern_id = auth.uid()
  );

drop policy if exists "accomplishments_intern_insert_own" on public.accomplishments;
create policy "accomplishments_intern_insert_own"
  on public.accomplishments
  for insert
  to authenticated
  with check (
    public.get_my_role() = 'intern'
    and intern_id = auth.uid()
    and status = 'pending'
    and reviewed_by is null
    and reviewed_at is null
  );

drop policy if exists "accomplishments_intern_update_own_editable" on public.accomplishments;
create policy "accomplishments_intern_update_own_editable"
  on public.accomplishments
  for update
  to authenticated
  using (
    public.get_my_role() = 'intern'
    and intern_id = auth.uid()
    and status in ('pending', 'returned')
  )
  with check (
    public.get_my_role() = 'intern'
    and intern_id = auth.uid()
    and status in ('pending', 'returned')
  );

drop policy if exists "accomplishments_supervisor_select_assigned" on public.accomplishments;
create policy "accomplishments_supervisor_select_assigned"
  on public.accomplishments
  for select
  to authenticated
  using (
    public.get_my_role() = 'supervisor'
    and exists (
      select 1
      from public.profiles p
      where p.id = accomplishments.intern_id
        and p.role = 'intern'
        and p.supervisor_id = auth.uid()
    )
  );

drop policy if exists "accomplishments_supervisor_update_assigned" on public.accomplishments;
create policy "accomplishments_supervisor_update_assigned"
  on public.accomplishments
  for update
  to authenticated
  using (
    public.get_my_role() = 'supervisor'
    and exists (
      select 1
      from public.profiles p
      where p.id = accomplishments.intern_id
        and p.role = 'intern'
        and p.supervisor_id = auth.uid()
    )
  )
  with check (
    public.get_my_role() = 'supervisor'
    and exists (
      select 1
      from public.profiles p
      where p.id = accomplishments.intern_id
        and p.role = 'intern'
        and p.supervisor_id = auth.uid()
    )
  );

drop policy if exists "accomplishments_coordinator_select_all" on public.accomplishments;
create policy "accomplishments_coordinator_select_all"
  on public.accomplishments
  for select
  to authenticated
  using (public.get_my_role() = 'coordinator');

drop policy if exists "accomplishments_coordinator_delete_only" on public.accomplishments;
create policy "accomplishments_coordinator_delete_only"
  on public.accomplishments
  for delete
  to authenticated
  using (public.get_my_role() = 'coordinator');

-- ----------------------------------------------------------------------------
-- 10. RLS Policies: public.tasks
-- ----------------------------------------------------------------------------
drop policy if exists "tasks_intern_select_own" on public.tasks;
create policy "tasks_intern_select_own"
  on public.tasks
  for select
  to authenticated
  using (
    public.get_my_role() = 'intern'
    and intern_id = auth.uid()
  );

drop policy if exists "tasks_intern_insert_own" on public.tasks;
create policy "tasks_intern_insert_own"
  on public.tasks
  for insert
  to authenticated
  with check (
    public.get_my_role() = 'intern'
    and intern_id = auth.uid()
    and status = 'pending'
    and reviewed_by is null
    and reviewed_at is null
  );

drop policy if exists "tasks_intern_update_own_editable" on public.tasks;
create policy "tasks_intern_update_own_editable"
  on public.tasks
  for update
  to authenticated
  using (
    public.get_my_role() = 'intern'
    and intern_id = auth.uid()
    and status in ('pending', 'returned')
  )
  with check (
    public.get_my_role() = 'intern'
    and intern_id = auth.uid()
    and status in ('pending', 'returned')
  );

drop policy if exists "tasks_supervisor_select_assigned" on public.tasks;
create policy "tasks_supervisor_select_assigned"
  on public.tasks
  for select
  to authenticated
  using (
    public.get_my_role() = 'supervisor'
    and exists (
      select 1
      from public.profiles p
      where p.id = tasks.intern_id
        and p.role = 'intern'
        and p.supervisor_id = auth.uid()
    )
  );

drop policy if exists "tasks_supervisor_update_assigned" on public.tasks;
create policy "tasks_supervisor_update_assigned"
  on public.tasks
  for update
  to authenticated
  using (
    public.get_my_role() = 'supervisor'
    and exists (
      select 1
      from public.profiles p
      where p.id = tasks.intern_id
        and p.role = 'intern'
        and p.supervisor_id = auth.uid()
    )
  )
  with check (
    public.get_my_role() = 'supervisor'
    and exists (
      select 1
      from public.profiles p
      where p.id = tasks.intern_id
        and p.role = 'intern'
        and p.supervisor_id = auth.uid()
    )
  );

drop policy if exists "tasks_coordinator_select_all" on public.tasks;
create policy "tasks_coordinator_select_all"
  on public.tasks
  for select
  to authenticated
  using (public.get_my_role() = 'coordinator');

drop policy if exists "tasks_coordinator_delete_only" on public.tasks;
create policy "tasks_coordinator_delete_only"
  on public.tasks
  for delete
  to authenticated
  using (public.get_my_role() = 'coordinator');
