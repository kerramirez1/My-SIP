-- ============================================================================
-- My SIP Portal — Schema & RLS Revision 1 (Foundation Fix)
-- Idempotent migration: safe to run once or multiple times in the Supabase
-- SQL Editor after schema.sql and storage.sql.
-- ============================================================================

-- ----------------------------------------------------------------------------
-- 1. Submission Status Enum — add 'rejected'
-- ----------------------------------------------------------------------------
alter type public.submission_status add value if not exists 'rejected';

-- ----------------------------------------------------------------------------
-- 2. PROFILES — per-intern internship details
-- ----------------------------------------------------------------------------
alter table public.profiles
  add column if not exists required_hours integer not null default 500,
  add column if not exists internship_start_date date,
  add column if not exists school_name text,
  add column if not exists course text;

do $$
begin
  if not exists (
    select 1
    from pg_constraint
    where conname = 'profiles_required_hours_positive'
      and conrelid = 'public.profiles'::regclass
  ) then
    alter table public.profiles
      add constraint profiles_required_hours_positive
      check (required_hours > 0);
  end if;
end
$$;

-- ----------------------------------------------------------------------------
-- 3. WEEKLY_ATTENDANCE — lunch break & rejected resubmission policy
-- ----------------------------------------------------------------------------
alter table public.weekly_attendance
  add column if not exists break_minutes integer not null default 60;

do $$
begin
  if not exists (
    select 1
    from pg_constraint
    where conname = 'weekly_attendance_break_minutes_range'
      and conrelid = 'public.weekly_attendance'::regclass
  ) then
    alter table public.weekly_attendance
      add constraint weekly_attendance_break_minutes_range
      check (break_minutes >= 0 and break_minutes <= 240);
  end if;
end
$$;

-- Note: status::text comparisons avoid PG 55P04 ("unsafe use of new enum value")
-- when ALTER TYPE ... ADD VALUE and CREATE POLICY run in the same transaction.
drop policy if exists "weekly_attendance_intern_update_own_editable" on public.weekly_attendance;
create policy "weekly_attendance_intern_update_own_editable"
  on public.weekly_attendance
  for update
  to authenticated
  using (
    public.get_my_role() = 'intern'
    and intern_id = (select auth.uid())
    and status::text in ('pending', 'returned', 'rejected')
  )
  with check (
    public.get_my_role() = 'intern'
    and intern_id = (select auth.uid())
    and status::text in ('pending', 'returned', 'rejected')
  );

-- ----------------------------------------------------------------------------
-- 4. ACCOMPLISHMENTS — weekly report fields & rejected resubmission policy
-- ----------------------------------------------------------------------------
alter table public.accomplishments
  add column if not exists skills_acquired text,
  add column if not exists challenges_encountered text,
  add column if not exists lessons_learned text;

drop policy if exists "accomplishments_intern_update_own_editable" on public.accomplishments;
create policy "accomplishments_intern_update_own_editable"
  on public.accomplishments
  for update
  to authenticated
  using (
    public.get_my_role() = 'intern'
    and intern_id = (select auth.uid())
    and status::text in ('pending', 'returned', 'rejected')
  )
  with check (
    public.get_my_role() = 'intern'
    and intern_id = (select auth.uid())
    and status::text in ('pending', 'returned', 'rejected')
  );

-- ----------------------------------------------------------------------------
-- 5. TASKS — supervisor-assigned model & intern completion submission
-- ----------------------------------------------------------------------------
alter table public.tasks
  add column if not exists assigned_by uuid references public.profiles (id) on delete set null,
  add column if not exists priority text not null default 'medium',
  add column if not exists deadline date,
  add column if not exists completion_description text,
  add column if not exists submission_attachment_url text,
  add column if not exists submitted_at timestamptz;

do $$
begin
  if not exists (
    select 1
    from pg_constraint
    where conname = 'tasks_priority_valid'
      and conrelid = 'public.tasks'::regclass
  ) then
    alter table public.tasks
      add constraint tasks_priority_valid
      check (priority in ('low', 'medium', 'high'));
  end if;
end
$$;

-- Backfill deadline for any existing tasks without deleting or altering old rows
update public.tasks
set deadline = task_date
where deadline is null;

-- Index foreign key and deadline lookup columns
create index if not exists idx_tasks_assigned_by
  on public.tasks (assigned_by);

create index if not exists idx_tasks_intern_deadline
  on public.tasks (intern_id, deadline);

-- Guard trigger: interns updating their own task may ONLY submit/resubmit
-- completion fields (completion_description, submission_attachment_url,
-- submitted_at) and reset status to 'pending' (clearing review columns).
-- They cannot alter supervisor-owned task details.
create or replace function public.guard_tasks_intern_update()
returns trigger
language plpgsql
set search_path = public
as $$
begin
  if auth.uid() is not null and public.get_my_role() = 'intern' then
    if new.intern_id is distinct from old.intern_id
      or new.assigned_by is distinct from old.assigned_by
      or new.title is distinct from old.title
      or new.description is distinct from old.description
      or new.task_date is distinct from old.task_date
      or new.deadline is distinct from old.deadline
      or new.priority is distinct from old.priority
      or new.created_at is distinct from old.created_at
    then
      raise exception 'Interns cannot modify supervisor-assigned task details.'
        using errcode = '42501';
    end if;

    if new.status::text <> 'pending' then
      raise exception 'Interns can only set task status to pending on submission or resubmission.'
        using errcode = '42501';
    end if;

    if new.reviewed_by is not null
      or new.reviewer_remarks is not null
      or new.reviewed_at is not null
    then
      raise exception 'Interns cannot set reviewer fields on tasks.'
        using errcode = '42501';
    end if;
  end if;

  return new;
end;
$$;

drop trigger if exists trg_tasks_guard_intern_update on public.tasks;
create trigger trg_tasks_guard_intern_update
  before update on public.tasks
  for each row
  execute function public.guard_tasks_intern_update();

-- Replace all public.tasks RLS policies
drop policy if exists "tasks_intern_select_own" on public.tasks;
drop policy if exists "tasks_intern_insert_own" on public.tasks;
drop policy if exists "tasks_intern_update_own_editable" on public.tasks;
drop policy if exists "tasks_intern_update_own_completion" on public.tasks;
drop policy if exists "tasks_supervisor_insert_assigned" on public.tasks;
drop policy if exists "tasks_supervisor_select_assigned" on public.tasks;
drop policy if exists "tasks_supervisor_update_assigned" on public.tasks;
drop policy if exists "tasks_coordinator_select_all" on public.tasks;
drop policy if exists "tasks_coordinator_delete_only" on public.tasks;

-- Intern: SELECT only own tasks (NO insert policy for interns)
create policy "tasks_intern_select_own"
  on public.tasks
  for select
  to authenticated
  using (
    public.get_my_role() = 'intern'
    and intern_id = (select auth.uid())
  );

-- Intern: UPDATE only own editable tasks to submit/resubmit completion
-- Column immutability is additionally enforced by trg_tasks_guard_intern_update.
create policy "tasks_intern_update_own_completion"
  on public.tasks
  for update
  to authenticated
  using (
    public.get_my_role() = 'intern'
    and intern_id = (select auth.uid())
    and status::text in ('pending', 'returned', 'rejected')
  )
  with check (
    public.get_my_role() = 'intern'
    and intern_id = (select auth.uid())
    and status::text = 'pending'
    and reviewed_by is null
    and reviewer_remarks is null
    and reviewed_at is null
  );

-- Supervisor: INSERT tasks only for interns assigned to them
create policy "tasks_supervisor_insert_assigned"
  on public.tasks
  for insert
  to authenticated
  with check (
    public.get_my_role() = 'supervisor'
    and assigned_by = (select auth.uid())
    and exists (
      select 1
      from public.profiles p
      where p.id = tasks.intern_id
        and p.role = 'intern'
        and p.supervisor_id = (select auth.uid())
    )
  );

-- Supervisor: SELECT tasks only for interns assigned to them
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
        and p.supervisor_id = (select auth.uid())
    )
  );

-- Supervisor: UPDATE (review/edit) tasks only for interns assigned to them
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
        and p.supervisor_id = (select auth.uid())
    )
  )
  with check (
    public.get_my_role() = 'supervisor'
    and exists (
      select 1
      from public.profiles p
      where p.id = tasks.intern_id
        and p.role = 'intern'
        and p.supervisor_id = (select auth.uid())
    )
  );

-- Coordinator: SELECT all tasks, DELETE only
create policy "tasks_coordinator_select_all"
  on public.tasks
  for select
  to authenticated
  using (public.get_my_role() = 'coordinator');

create policy "tasks_coordinator_delete_only"
  on public.tasks
  for delete
  to authenticated
  using (public.get_my_role() = 'coordinator');

-- ----------------------------------------------------------------------------
-- 6. STORAGE — reuse private "attachments" bucket (<intern_id>/<filename>)
--    Covers both accomplishment attachments and task submission files.
-- ----------------------------------------------------------------------------
insert into storage.buckets (id, name, public)
values ('attachments', 'attachments', false)
on conflict (id) do update
  set public = false;

drop policy if exists "attachments_intern_insert_own_folder" on storage.objects;
create policy "attachments_intern_insert_own_folder"
  on storage.objects
  for insert
  to authenticated
  with check (
    bucket_id = 'attachments'
    and public.get_my_role() = 'intern'
    and array_length(storage.foldername(name), 1) = 1
    and (storage.foldername(name))[1] = (select auth.uid()::text)
  );

drop policy if exists "attachments_intern_select_own_folder" on storage.objects;
create policy "attachments_intern_select_own_folder"
  on storage.objects
  for select
  to authenticated
  using (
    bucket_id = 'attachments'
    and public.get_my_role() = 'intern'
    and array_length(storage.foldername(name), 1) = 1
    and (storage.foldername(name))[1] = (select auth.uid()::text)
  );

drop policy if exists "attachments_supervisor_select_assigned_interns" on storage.objects;
create policy "attachments_supervisor_select_assigned_interns"
  on storage.objects
  for select
  to authenticated
  using (
    bucket_id = 'attachments'
    and public.get_my_role() = 'supervisor'
    and array_length(storage.foldername(name), 1) = 1
    and exists (
      select 1
      from public.profiles p
      where p.id::text = (storage.foldername(name))[1]
        and p.role = 'intern'
        and p.supervisor_id = (select auth.uid())
    )
  );

drop policy if exists "attachments_coordinator_select_all" on storage.objects;
create policy "attachments_coordinator_select_all"
  on storage.objects
  for select
  to authenticated
  using (
    bucket_id = 'attachments'
    and public.get_my_role() = 'coordinator'
  );

-- ----------------------------------------------------------------------------
-- 7. Data API Role Grants (idempotent safety)
-- ----------------------------------------------------------------------------
grant usage on schema public to authenticated, service_role;
grant select, insert, update, delete
  on public.profiles,
     public.weekly_attendance,
     public.accomplishments,
     public.tasks
  to authenticated, service_role;
