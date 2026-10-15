-- Record explicit opt-in given in Nora before collecting contact details.
-- Existing sessions remain unconsented; no consent is inferred from historical messages.
ALTER TABLE public.nora_web_sessions
  ADD COLUMN IF NOT EXISTS privacy_consent_at timestamptz,
  ADD COLUMN IF NOT EXISTS privacy_policy_version text;
COMMENT ON COLUMN public.nora_web_sessions.privacy_consent_at IS
  'Server timestamp set only after the visitor explicitly selects the Nora contact consent option.';
COMMENT ON COLUMN public.nora_web_sessions.privacy_policy_version IS
  'Version of public privacy policy displayed when visitor explicitly consented.';
