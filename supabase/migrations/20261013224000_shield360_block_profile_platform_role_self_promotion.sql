-- NEXO Shield 360: prevent self-promotion to platform_admin.
-- Applied to NEXO Platform via Supabase migration on 2026-10-13.
-- Owner profile editing remains allowed for: full_name, contact_email,
-- phone, job_title, avatar_url, bio, updated_at. Protected: platform_role,
-- id, created_at. Existing RLS continues to scope access to own profile.
-- service_role and trusted backend administration are unaffected.

REVOKE UPDATE ON TABLE public.profiles FROM authenticated, anon;
GRANT UPDATE (full_name, contact_email, phone, job_title, avatar_url, bio, updated_at)
  ON TABLE public.profiles TO authenticated;

-- Future-proof against accidental regranting of table-wide UPDATE.
CREATE OR REPLACE FUNCTION private.prevent_untrusted_profile_role_changes()
RETURNS trigger LANGUAGE plpgsql SECURITY INVOKER SET search_path = pg_catalog AS $$
BEGIN
  IF current_user IN ('authenticated','anon') AND
    (NEW.platform_role IS DISTINCT FROM OLD.platform_role
      OR NEW.id IS DISTINCT FROM OLD.id
      OR NEW.created_at IS DISTINCT FROM OLD.created_at) THEN
    RAISE EXCEPTION 'Profile identity and platform permissions cannot be modified by this account'
      USING ERRCODE = '42501';
  END IF;
  RETURN NEW;
END
$$;
REVOKE ALL ON FUNCTION private.prevent_untrusted_profile_role_changes()
  FROM PUBLIC, anon, authenticated;
DROP TRIGGER IF EXISTS prevent_untrusted_profile_role_changes ON public.profiles;
CREATE TRIGGER prevent_untrusted_profile_role_changes
  BEFORE UPDATE ON public.profiles
  FOR EACH ROW EXECUTE FUNCTION private.prevent_untrusted_profile_role_changes();

-- Verified in production:
-- normal user cannot UPDATE platform_role / id / created_at.
-- normal user can UPDATE full_name / avatar_url / contact_email / phone.
-- privileged service_role retains platform_role update.
-- SQL rollback test using an authenticated ordinary user:
-- attempted role change denied; self-profile update succeeded; ROLLBACK.
