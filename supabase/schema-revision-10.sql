-- ============================================================================
-- My SIP Portal — Schema Revision 10 (Immediate Daily Accomplishment Visibility
-- & Explicit Weekly Report Submission Workflow)
-- Idempotent migration: safe to run once or multiple times in the Supabase
-- SQL Editor after schema.sql, storage.sql, and schema-revision-1..9.sql.
--
-- Design & Backward Compatibility:
-- - Zero new tables required. Mirrors the existing public.tasks.submitted_at
--   pattern on public.accomplishments:
--     * status = 'pending' AND submitted_at IS NULL
--         -> Saved – Not Yet Submitted (immediately visible to the assigned
--            supervisor and SIP Coordinator in view-only monitoring, editable
--            and deletable by the intern, NEVER counted as pending approval).
--     * status = 'pending' AND submitted_at IS NOT NULL
--         -> Officially submitted for supervisor review (locked from intern
--            editing/deleting until returned/rejected, counted in pending
--            reviews, triggers supervisor weekly submission notification).
--     * status = 'approved'
--         -> Approved and locked in official accomplishment history.
--     * status IN ('returned', 'rejected')
--         -> Editable by the intern for revision and resubmission.
-- - All historical/existing accomplishment records present when this migration
--   first runs are backfilled with submitted_at = coalesce(created_at, now())
--   so zero historical or approved records become unsubmitted drafts.
-- ============================================================================

-- ----------------------------------------------------------------------------
-- 1. ACCOMPLISHMENTS — submitted_at timestamp + idempotent historical backfill
-- ----------------------------------------------------------------------------
do $$
declare
  v_had_submitted_at boolean;
begin
  select exists (
    select 1
    from information_schema.columns
    where table_schema = 'public'
      and table_name = 'accomplishments'
      and column_name = 'submitted_at'
  ) into v_had_submitted_at;

  if not v_had_submitted_at then
    alter table public.accomplishments
      add column submitted_at timestamptz;

    -- Backfill all pre-existing rows as already submitted so legacy and
    -- previously submitted reports preserve their review/approval status.
    update public.accomplishments
      set submitted_at = coalesce(created_at, now())
      where submitted_at is null;
  end if;
end
$$;

-- Safety invariant: any row already reviewed (approved, returned, rejected)
-- must always carry a non-null submitted_at timestamp.
update public.accomplishments
  set submitted_at = coalesce(created_at, now())
  where submitted_at is null
    and status::text in ('approved', 'returned', 'rejected');

create index if not exists idx_accomplishments_intern_week_submitted
  on public.accomplishments (intern_id, week_of, submitted_at);

-- ----------------------------------------------------------------------------
-- 2. ACCOMPLISHMENTS — guard intern updates (prevent un-submitting & tampering)
-- ----------------------------------------------------------------------------
create or replace function public.guard_accomplishments_intern_update()
returns trigger
language plpgsql
set search_path = public
as $$
begin
  if auth.uid() is not null and public.get_my_role() = 'intern' then
    if new.intern_id is distinct from old.intern_id then
      raise exception 'Interns cannot change the intern who owns an accomplishment record.'
        using errcode = '42501';
    end if;

    if new.status::text <> 'pending' then
      raise exception 'Interns can only set accomplishment status to pending on submission or resubmission.'
        using errcode = '42501';
    end if;

    if new.reviewed_by is not null
      or new.reviewer_remarks is not null
      or new.reviewed_at is not null
    then
      raise exception 'Interns cannot set reviewer fields on accomplishment records.'
        using errcode = '42501';
    end if;

    if old.submitted_at is not null and new.submitted_at is null then
      raise exception 'Submitted accomplishment reports cannot be reverted to draft.'
        using errcode = '42501';
    end if;

    if old.status::text in ('returned', 'rejected') and new.submitted_at is null then
      raise exception 'Resubmitting a returned accomplishment requires a submission timestamp.'
        using errcode = '42501';
    end if;
  end if;

  return new;
end;
$$;

drop trigger if exists trg_accomplishments_guard_intern_update on public.accomplishments;
create trigger trg_accomplishments_guard_intern_update
  before update on public.accomplishments
  for each row
  execute function public.guard_accomplishments_intern_update();

-- ----------------------------------------------------------------------------
-- 3. ACCOMPLISHMENTS — RLS policies for draft visibility, delete, & review lock
-- ----------------------------------------------------------------------------

-- Interns can insert own daily entries as drafts (submitted_at is null) or
-- submitted entries, always starting with status = 'pending' and no review fields.
drop policy if exists "accomplishments_intern_insert_own" on public.accomplishments;
create policy "accomplishments_intern_insert_own"
  on public.accomplishments
  for insert
  to authenticated
  with check (
    (select public.get_my_role()) = 'intern'
    and intern_id = (select auth.uid())
    and status::text = 'pending'
    and reviewed_by is null
    and reviewer_remarks is null
    and reviewed_at is null
  );

-- Interns can edit own entries ONLY while unsubmitted (draft) or when returned/
-- rejected for revision. Once officially submitted and awaiting review (or
-- approved), intern edits are blocked until a supervisor returns the entry.
drop policy if exists "accomplishments_intern_update_own_editable" on public.accomplishments;
create policy "accomplishments_intern_update_own_editable"
  on public.accomplishments
  for update
  to authenticated
  using (
    (select public.get_my_role()) = 'intern'
    and intern_id = (select auth.uid())
    and (
      (status::text = 'pending' and submitted_at is null)
      or status::text in ('returned', 'rejected')
    )
  )
  with check (
    (select public.get_my_role()) = 'intern'
    and intern_id = (select auth.uid())
    and status::text = 'pending'
    and reviewed_by is null
    and reviewer_remarks is null
    and reviewed_at is null
  );

-- Interns can delete their own saved daily entries ONLY while unsubmitted.
-- Submitted, returned, rejected, and approved records remain preserved.
drop policy if exists "accomplishments_intern_delete_own_draft" on public.accomplishments;
create policy "accomplishments_intern_delete_own_draft"
  on public.accomplishments
  for delete
  to authenticated
  using (
    (select public.get_my_role()) = 'intern'
    and intern_id = (select auth.uid())
    and status::text = 'pending'
    and submitted_at is null
  );

-- Supervisors immediately see ALL accomplishment entries (both saved unsubmitted
-- daily updates and officially submitted reports) for their assigned interns only.
drop policy if exists "accomplishments_supervisor_select_assigned" on public.accomplishments;
create policy "accomplishments_supervisor_select_assigned"
  on public.accomplishments
  for select
  to authenticated
  using (
    (select public.get_my_role()) = 'supervisor'
    and exists (
      select 1
      from public.profiles p
      where p.id = accomplishments.intern_id
        and p.role = 'intern'
        and p.supervisor_id = (select auth.uid())
    )
  );

-- Supervisors can formally approve, return, or reject ONLY officially submitted
-- accomplishment entries (submitted_at is not null) of their assigned interns.
-- Saved unsubmitted daily updates are strictly view-only.
drop policy if exists "accomplishments_supervisor_update_assigned" on public.accomplishments;
create policy "accomplishments_supervisor_update_assigned"
  on public.accomplishments
  for update
  to authenticated
  using (
    (select public.get_my_role()) = 'supervisor'
    and submitted_at is not null
    and exists (
      select 1
      from public.profiles p
      where p.id = accomplishments.intern_id
        and p.role = 'intern'
        and p.supervisor_id = (select auth.uid())
    )
  )
  with check (
    (select public.get_my_role()) = 'supervisor'
    and submitted_at is not null
    and exists (
      select 1
      from public.profiles p
      where p.id = accomplishments.intern_id
        and p.role = 'intern'
        and p.supervisor_id = (select auth.uid())
    )
  );
