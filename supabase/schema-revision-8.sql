-- ============================================================================
-- My SIP Portal — Schema Revision 8 (handle_new_user No Longer Trusts the
-- Signup Metadata Role)
-- Idempotent migration: safe to run once or multiple times in the Supabase
-- SQL Editor after schema.sql, storage.sql, and schema-revision-1..7.sql.
--
-- DEPLOY ORDER: deploy the updated create-account Edge Function FIRST
-- (it now sets profiles.role explicitly in its service-role profile
-- update), and only then run this revision. The function change is
-- harmless under the old trigger; the reverse order would create new
-- supervisor accounts as interns until the function is deployed.
--
-- Behavior:
-- - Previously, public.handle_new_user() accepted 'intern', 'supervisor',
--   or 'coordinator' from new.raw_user_meta_data, so anyone able to sign
--   up with crafted metadata could obtain a coordinator profile.
-- - The function below is identical to the schema.sql version EXCEPT the
--   role is always 'intern' and the metadata 'role' value is ignored
--   entirely. Privileged flows assign the real role afterward through
--   service-role profile updates, which this trigger does not block:
--   create-account sets role in its profile completion update, and the
--   seed script corrects the role of any existing profile it manages.
-- - The full_name derivation, security definer, search_path, and
--   on-conflict behavior are unchanged, and the existing
--   on_auth_user_created trigger is kept as is (not dropped/recreated).
-- ============================================================================

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

  -- The signup metadata role is deliberately ignored: every new profile
  -- starts as 'intern', and privileged service-role flows (create-account,
  -- seed script) assign the real role afterward.
  v_role := 'intern'::public.user_role;

  insert into public.profiles (id, full_name, role)
  values (new.id, v_full_name, v_role)
  on conflict (id) do nothing;

  return new;
end;
$$;
