-- ============================================================================
-- My SIP Portal — Schema Revision 7 (Submission Deletion Logs)
-- Idempotent migration: safe to run once or multiple times in the Supabase
-- SQL Editor after schema.sql, storage.sql, and schema-revision-1..6.sql.
--
-- Behavior:
-- - The coordinator's DeleteRecordDialog has always required a typed
--   administrative reason before removing a submission record, but the
--   reason was only shown in the on-screen success banner and never stored.
-- - This table persists one row per coordinator deletion, written by the
--   client BEFORE the record is deleted (the delete is aborted when the
--   log insert fails). It follows the public.account_audit_logs pattern
--   (schema-revision-4.sql): record_id deliberately has NO foreign key and
--   the intern/coordinator identities are denormalized snapshots, so the
--   log survives the deletion it describes.
-- - Coordinators can read and insert logs from the browser client; there
--   is no UPDATE or DELETE policy for authenticated, so logs cannot be
--   edited or removed from the client.
-- ============================================================================

create table if not exists public.submission_deletion_logs (
  id uuid primary key default gen_random_uuid(),
  record_table text not null
    check (record_table in ('weekly_attendance', 'accomplishments', 'tasks')),
  record_id uuid not null,
  record_type_label text not null,
  record_title text,
  intern_id uuid,
  intern_name text not null,
  status_at_deletion text not null,
  reason text not null,
  performed_by uuid references public.profiles (id) on delete set null,
  performed_by_name text not null,
  created_at timestamptz not null default now()
);

create index if not exists idx_submission_deletion_logs_created_at
  on public.submission_deletion_logs (created_at desc);

create index if not exists idx_submission_deletion_logs_record_id
  on public.submission_deletion_logs (record_id);

create index if not exists idx_submission_deletion_logs_performed_by
  on public.submission_deletion_logs (performed_by);

alter table public.submission_deletion_logs enable row level security;

drop policy if exists "submission_deletion_logs_coordinator_select_all" on public.submission_deletion_logs;
create policy "submission_deletion_logs_coordinator_select_all"
  on public.submission_deletion_logs
  for select
  to authenticated
  using ((select public.get_my_role()) = 'coordinator');

drop policy if exists "submission_deletion_logs_coordinator_insert_own" on public.submission_deletion_logs;
create policy "submission_deletion_logs_coordinator_insert_own"
  on public.submission_deletion_logs
  for insert
  to authenticated
  with check (
    (select public.get_my_role()) = 'coordinator'
    and performed_by = (select auth.uid())
  );

-- Explicit grants (required for Data API exposure; authenticated can read
-- and append logs but cannot edit or delete them from browser clients)
revoke all on public.submission_deletion_logs from public, anon, authenticated;
grant select, insert on public.submission_deletion_logs to authenticated;
grant select, insert, update, delete on public.submission_deletion_logs to service_role;
