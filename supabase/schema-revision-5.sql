-- ============================================================================
-- My SIP Portal — Schema Revision 5 (Guard Intern Updates on
-- weekly_attendance and accomplishments)
-- Idempotent migration: safe to run once or multiple times in the Supabase
-- SQL Editor after schema.sql, storage.sql, and schema-revision-1..4.sql.
--
-- Behavior:
-- - Mirrors public.guard_tasks_intern_update() (schema-revision-1.sql) for
--   the two remaining submission tables. Their RLS UPDATE policies check
--   only row ownership and status, so without a guard an intern calling the
--   Supabase API directly could set reviewed_by / reviewer_remarks /
--   reviewed_at (or a non-pending status) on their own row.
-- - For intern callers only (auth.uid() is not null and
--   public.get_my_role() = 'intern'), a BEFORE UPDATE guard raises
--   errcode '42501' when the update changes intern_id, sets a status other
--   than 'pending', or leaves any reviewer field non-NULL.
-- - Legitimate intern edits are unaffected: the UI resubmits returned or
--   rejected rows with status 'pending' and the review fields nulled (see
--   getReviewResetPayload() in src/lib/submissionHelpers.js), and editing a
--   pending row leaves its status 'pending' with review fields already null.
-- - Supervisor, coordinator, and service-role updates pass through
--   untouched: the guard fires only for intern callers, and service-role
--   connections have auth.uid() null (Edge Functions, seed script).
-- ============================================================================

-- ----------------------------------------------------------------------------
-- 1. WEEKLY ATTENDANCE — guard intern updates
-- ----------------------------------------------------------------------------

-- Guard trigger: interns updating their own attendance may ONLY edit the
-- entry's own fields and reset status to 'pending' (clearing review
-- columns). They cannot set reviewer fields or a non-pending status.
create or replace function public.guard_attendance_intern_update()
returns trigger
language plpgsql
set search_path = public
as $$
begin
  if auth.uid() is not null and public.get_my_role() = 'intern' then
    if new.intern_id is distinct from old.intern_id then
      raise exception 'Interns cannot change the intern who owns an attendance record.'
        using errcode = '42501';
    end if;

    if new.status::text <> 'pending' then
      raise exception 'Interns can only set attendance status to pending on submission or resubmission.'
        using errcode = '42501';
    end if;

    if new.reviewed_by is not null
      or new.reviewer_remarks is not null
      or new.reviewed_at is not null
    then
      raise exception 'Interns cannot set reviewer fields on attendance records.'
        using errcode = '42501';
    end if;
  end if;

  return new;
end;
$$;

drop trigger if exists trg_attendance_guard_intern_update on public.weekly_attendance;
create trigger trg_attendance_guard_intern_update
  before update on public.weekly_attendance
  for each row
  execute function public.guard_attendance_intern_update();

-- ----------------------------------------------------------------------------
-- 2. ACCOMPLISHMENTS — guard intern updates
-- ----------------------------------------------------------------------------

-- Guard trigger: interns updating their own accomplishment may ONLY edit
-- the report's own fields and reset status to 'pending' (clearing review
-- columns). They cannot set reviewer fields or a non-pending status.
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
  end if;

  return new;
end;
$$;

drop trigger if exists trg_accomplishments_guard_intern_update on public.accomplishments;
create trigger trg_accomplishments_guard_intern_update
  before update on public.accomplishments
  for each row
  execute function public.guard_accomplishments_intern_update();
