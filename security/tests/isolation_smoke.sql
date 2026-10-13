-- NEXO Shield 360 · Read-only RLS smoke test (manual)
-- Run only in NEXO Platform with database owner permissions.
-- No data is modified; entire test runs in a rolled-back transaction.
-- Uses an existing non-admin account and a *different* client organization,
-- without outputting IDs, names or customer records.
BEGIN;
SELECT
 set_config('nexo.shield.actor',
  (select m.user_id::text from public.organization_members m
   join public.profiles p on p.id=m.user_id
   where p.platform_role<>'platform_admin' order by m.created_at limit 1),true),
 set_config('nexo.shield.other',
  (select o.id::text from public.organizations o
   where o.name<>'NEXO Internal'
   and not exists(select 1 from public.organization_members m
    join public.profiles p on p.id=m.user_id
    where p.platform_role<>'platform_admin' and m.organization_id=o.id)
   order by o.created_at limit 1),true);
SET LOCAL ROLE authenticated;
SELECT set_config('request.jwt.claim.sub',current_setting('nexo.shield.actor'),true);
DO $test$
DECLARE target uuid:=nullif(current_setting('nexo.shield.other',true),'')::uuid;
BEGIN
 IF target is null THEN RAISE EXCEPTION 'No second client scope available for isolation test'; END IF;
 IF EXISTS (SELECT 1 FROM public.organizations WHERE id=target) THEN RAISE EXCEPTION 'Cross-client organizations exposed'; END IF;
 IF EXISTS (SELECT 1 FROM public.contacts WHERE organization_id=target) THEN RAISE EXCEPTION 'Cross-client contacts exposed'; END IF;
 IF EXISTS (SELECT 1 FROM public.conversations WHERE organization_id=target) THEN RAISE EXCEPTION 'Cross-client conversations exposed'; END IF;
 IF EXISTS (SELECT 1 FROM public.work_tasks WHERE organization_id=target) THEN RAISE EXCEPTION 'Cross-client tasks exposed'; END IF;
 IF EXISTS (SELECT 1 FROM public.nexo_projects WHERE organization_id=target) THEN RAISE EXCEPTION 'Cross-client projects exposed'; END IF;
 IF EXISTS (SELECT 1 FROM public.client_invoices WHERE organization_id=target) THEN RAISE EXCEPTION 'Cross-client billing exposed'; END IF;
 IF EXISTS (SELECT 1 FROM public.nexo_shield_incidents) THEN RAISE EXCEPTION 'Founder incidents exposed'; END IF;
 BEGIN
  PERFORM public.nexo_shield_status();
  RAISE EXCEPTION 'Founder-only security RPC accessible to client';
 EXCEPTION WHEN insufficient_privilege THEN NULL;
 END;
END $test$;
ROLLBACK;
-- PASS means no exception and no client-B rows visible.
-- These checks do not establish browser integration or full penetration test coverage.
