-- ============================================================================
-- My SIP Portal — Supabase Storage Bucket & Policies for Attachments
-- Run once in the Supabase SQL Editor after schema.sql.
-- ============================================================================

-- ----------------------------------------------------------------------------
-- 1. Create Private "attachments" Bucket
-- ----------------------------------------------------------------------------
insert into storage.buckets (id, name, public)
values ('attachments', 'attachments', false)
on conflict (id) do update
  set public = false;

-- ----------------------------------------------------------------------------
-- 2. Storage RLS Policies on storage.objects
--    Expected path format: <intern_id>/<filename>
-- ----------------------------------------------------------------------------

-- Interns: upload files only inside their own profile-id folder
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

-- Interns: read files only inside their own profile-id folder
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

-- Supervisors: read files only for interns assigned to them
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

-- Coordinators: read all files in the attachments bucket
drop policy if exists "attachments_coordinator_select_all" on storage.objects;
create policy "attachments_coordinator_select_all"
  on storage.objects
  for select
  to authenticated
  using (
    bucket_id = 'attachments'
    and public.get_my_role() = 'coordinator'
  );
