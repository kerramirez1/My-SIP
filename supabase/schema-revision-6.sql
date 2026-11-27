-- ============================================================================
-- My SIP Portal — Schema Revision 6 (Storage DELETE Policies for the
-- "attachments" Bucket)
-- Idempotent migration: safe to run once or multiple times in the Supabase
-- SQL Editor after schema.sql, storage.sql, and schema-revision-1..5.sql.
--
-- Behavior:
-- - The private "attachments" bucket previously had INSERT and SELECT
--   policies only, so no client could ever delete an object: every replaced,
--   removed, or record-deleted attachment stayed in the bucket forever.
-- - This revision adds exactly two DELETE policies on storage.objects,
--   mirroring the folder tests of the existing intern/coordinator policies:
--   interns may delete only inside their own <intern_id>/<filename> folder,
--   and coordinators may delete any object in the bucket.
-- - No supervisor DELETE policy: supervisors never manage files.
-- - No UPDATE policy is needed: uploads always create a new UUID-prefixed
--   path (buildAttachmentFileName in src/lib/submissionHelpers.js), so a
--   replaced attachment is a new object plus a delete of the old one.
-- - Bucket privacy, path conventions, and all existing policies are
--   unchanged.
-- ============================================================================

-- ----------------------------------------------------------------------------
-- 1. Interns: delete files only inside their own profile-id folder
-- ----------------------------------------------------------------------------
drop policy if exists "attachments_intern_delete_own_folder" on storage.objects;
create policy "attachments_intern_delete_own_folder"
  on storage.objects
  for delete
  to authenticated
  using (
    bucket_id = 'attachments'
    and public.get_my_role() = 'intern'
    and array_length(storage.foldername(name), 1) = 1
    and (storage.foldername(name))[1] = (select auth.uid()::text)
  );

-- ----------------------------------------------------------------------------
-- 2. Coordinators: delete any file in the attachments bucket
-- ----------------------------------------------------------------------------
drop policy if exists "attachments_coordinator_delete_all" on storage.objects;
create policy "attachments_coordinator_delete_all"
  on storage.objects
  for delete
  to authenticated
  using (
    bucket_id = 'attachments'
    and public.get_my_role() = 'coordinator'
  );
