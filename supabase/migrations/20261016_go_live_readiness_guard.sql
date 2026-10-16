-- Prevent false Go Live certifications.
-- Only platform administrators can activate an organization, and the final
-- implementation/testing checklist must be approved before activation.
-- Existing live clients and records are not modified by this migration.
CREATE OR REPLACE FUNCTION public.platform_activate_go_live(p_organization_id uuid)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'pg_catalog', 'public', 'private'
AS $function$
DECLARE
  v_org public.organizations%ROWTYPE;
  v_onboarding public.organization_onboarding%ROWTYPE;
  v_commercial public.organization_commercials%ROWTYPE;
  v_assistant_required boolean;
BEGIN
  IF NOT public.is_platform_admin() THEN
    RAISE EXCEPTION 'Not authorized';
  END IF;

  SELECT * INTO v_org FROM public.organizations
    WHERE id=p_organization_id AND name<>'NEXO Internal' FOR UPDATE;
  IF NOT FOUND THEN RAISE EXCEPTION 'Organization not found'; END IF;

  SELECT * INTO v_onboarding FROM public.organization_onboarding
    WHERE organization_id=p_organization_id FOR UPDATE;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'No onboarding record: complete the implementation checklist first';
  END IF;

  SELECT * INTO v_commercial FROM public.organization_commercials
    WHERE organization_id=p_organization_id FOR UPDATE;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'Missing commercial setup for this organization';
  END IF;

  IF v_onboarding.go_live_status='done' AND v_commercial.lifecycle_stage='activo' THEN
    RETURN jsonb_build_object('ok',true,'already_live',true,
      'organization_id',p_organization_id,'name',v_org.name);
  END IF;

  IF COALESCE(array_length(v_org.service_lines,1),0)=0 THEN
    RAISE EXCEPTION 'Choose at least one NEXO service line before Go Live';
  END IF;
  IF v_onboarding.company_status<>'done' OR
     v_onboarding.testing_status<>'done' OR
     v_onboarding.assistant_status NOT IN ('done','not_needed') OR
     v_onboarding.catalog_status NOT IN ('done','not_needed') OR
     v_onboarding.integrations_status NOT IN ('done','not_needed') OR
     v_onboarding.users_status NOT IN ('done','not_needed') THEN
    RAISE EXCEPTION 'Onboarding incomplete: approve company, configuration, access and final tests before Go Live';
  END IF;

  IF NOT EXISTS(
    SELECT 1 FROM public.organization_settings s
     WHERE s.organization_id=p_organization_id AND (
       NULLIF(BTRIM(s.notification_email),'') IS NOT NULL OR
       NULLIF(BTRIM(s.whatsapp),'') IS NOT NULL OR
       NULLIF(BTRIM(s.handoff_phone),'') IS NOT NULL
     )
  ) THEN
    RAISE EXCEPTION 'Operational contact missing: configure email or WhatsApp';
  END IF;

  v_assistant_required := 'assistants'=ANY(v_org.service_lines);
  IF v_assistant_required THEN
    IF v_onboarding.assistant_status<>'done' OR v_onboarding.catalog_status<>'done' THEN
      RAISE EXCEPTION 'Assistant and catalog must both be approved for NEXO Assistants';
    END IF;
    IF NOT EXISTS(
      SELECT 1 FROM public.assistants a
      WHERE a.organization_id=p_organization_id AND a.status='active'
    ) THEN
      RAISE EXCEPTION 'No active assistant for this organization';
    END IF;
    IF NOT EXISTS(
      SELECT 1 FROM public.services s
      WHERE s.organization_id=p_organization_id AND s.active=true
    ) THEN
      RAISE EXCEPTION 'No active approved catalog services';
    END IF;
  END IF;

  -- Do not manufacture completion of unreviewed company, assistant,
  -- catalog, integrations, access, or testing steps.
  UPDATE public.organization_onboarding
     SET overall_status='live',
         go_live_status='done',
         updated_by=auth.uid(),
         updated_at=now()
   WHERE organization_id=p_organization_id;

  UPDATE public.organizations
     SET status='active',updated_at=now()
   WHERE id=p_organization_id;

  UPDATE public.organization_commercials
     SET lifecycle_stage='activo',
         implementation_status='active',
         go_live_date=COALESCE(go_live_date,CURRENT_DATE),
         updated_at=now()
   WHERE organization_id=p_organization_id;

  RETURN jsonb_build_object('ok',true,'already_live',false,
    'organization_id',p_organization_id,'name',v_org.name);
END;
$function$;

COMMENT ON FUNCTION public.platform_activate_go_live(uuid) IS
  'Platform-admin Go Live activation with server-enforced readiness. Never auto-approves unverified testing or setup.';


-- New accounts must actually complete "Empresa"; do not pre-certify the
-- first step merely because an organization record was created.
-- This only changes future inserts. No existing onboarding is rewritten.
CREATE OR REPLACE FUNCTION private.seed_organization_onboarding()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'pg_catalog', 'public'
AS $function$
BEGIN
  IF NEW.name<>'NEXO Internal' THEN
    INSERT INTO public.organization_onboarding(organization_id,overall_status)
    VALUES (NEW.id,'in_progress')
    ON CONFLICT (organization_id) DO NOTHING;
  END IF;
  RETURN NEW;
END;
$function$;

COMMENT ON FUNCTION private.seed_organization_onboarding() IS
  'Creates a pending checklist for new clients without marking unverified company setup as complete.';


-- RLS also permits assigned implementation staff to edit ordinary checklist
-- steps. They must not be able to bypass platform_activate_go_live by setting
-- go_live_status/overall_status directly. The RPC runs as its postgres owner
-- (SECURITY DEFINER) after checking the actual caller is a platform admin.
CREATE OR REPLACE FUNCTION private.prevent_unverified_go_live_updates()
RETURNS trigger
LANGUAGE plpgsql
SECURITY INVOKER
SET search_path TO 'pg_catalog', 'public'
AS $function$
BEGIN
  IF CURRENT_USER <> 'postgres' THEN
    IF TG_OP='INSERT' THEN
      IF NEW.go_live_status='done' OR NEW.overall_status='live' THEN
        RAISE EXCEPTION 'Go Live can only be activated through the verified platform action';
      END IF;
    ELSIF NEW.go_live_status IS DISTINCT FROM OLD.go_live_status
       OR (NEW.overall_status='live' AND OLD.overall_status IS DISTINCT FROM 'live') THEN
      RAISE EXCEPTION 'Go Live status is protected; use the platform activation action';
    END IF;
  END IF;
  RETURN NEW;
END;
$function$;

DROP TRIGGER IF EXISTS protect_organization_go_live ON public.organization_onboarding;
CREATE TRIGGER protect_organization_go_live
BEFORE INSERT OR UPDATE ON public.organization_onboarding
FOR EACH ROW EXECUTE FUNCTION private.prevent_unverified_go_live_updates();

COMMENT ON FUNCTION private.prevent_unverified_go_live_updates() IS
  'Rejects direct Go Live status changes by authenticated users while allowing normal checklist edits.';
