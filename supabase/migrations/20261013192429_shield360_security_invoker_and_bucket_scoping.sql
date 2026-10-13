-- Follow-up to 20261013192500_shield360_founder_incident_register_and_live_security_snapshot.
-- Keep the public RPC SECURITY INVOKER and place privileged Storage metadata
-- access behind an admin-checked helper in the unexposed private schema.
-- Persist conservative table grants for new tables as well.
revoke truncate,trigger,references on public.nexo_shield_incidents from anon,authenticated;
alter default privileges for role postgres in schema public
  revoke truncate,trigger,references on tables from anon,authenticated;

create or replace function private.nexo_shield_bucket_count(want_public boolean)
returns bigint language plpgsql stable security definer set search_path='pg_catalog'
as $$
begin
 if not private.is_platform_admin() then
  raise exception 'NEXO Shield bucket access denied' using errcode='42501';
 end if;
 return (select count(*) from storage.buckets where public=want_public);
end $$;
revoke all on function private.nexo_shield_bucket_count(boolean) from public,anon;
grant execute on function private.nexo_shield_bucket_count(boolean) to authenticated;

create or replace function public.nexo_shield_status()
returns jsonb language plpgsql stable security invoker set search_path='pg_catalog'
as $$
declare result jsonb;
begin
 if not private.is_platform_admin() then
   raise exception 'NEXO Shield access denied' using errcode='42501';
 end if;
 select jsonb_build_object(
  'checked_at',now(),
  'public_tables',(select count(*) from pg_catalog.pg_class c join pg_catalog.pg_namespace n on n.oid=c.relnamespace where n.nspname='public' and c.relkind in('r','p')),
  'rls_enabled',(select count(*) from pg_catalog.pg_class c join pg_catalog.pg_namespace n on n.oid=c.relnamespace where n.nspname='public' and c.relkind in('r','p') and c.relrowsecurity),
  'tables_missing_rls',(select count(*) from pg_catalog.pg_class c join pg_catalog.pg_namespace n on n.oid=c.relnamespace where n.nspname='public' and c.relkind in('r','p') and not c.relrowsecurity),
  'private_storage_buckets',private.nexo_shield_bucket_count(false),
  'public_storage_buckets',private.nexo_shield_bucket_count(true),
  'audit_changes_7d',(select count(*) from public.audit_log where created_at>now()-interval '7 days'),
  'audit_last_at',(select max(created_at) from public.audit_log),
  'incidents_open',(select count(*) from public.nexo_shield_incidents where status<>'resolved'),
  'anon_truncate_grants',(select count(*) from pg_catalog.pg_class c join pg_catalog.pg_namespace n on n.oid=c.relnamespace where n.nspname='public' and c.relkind in('r','p') and has_table_privilege('anon',c.oid,'TRUNCATE')),
  'authenticated_truncate_grants',(select count(*) from pg_catalog.pg_class c join pg_catalog.pg_namespace n on n.oid=c.relnamespace where n.nspname='public' and c.relkind in('r','p') and has_table_privilege('authenticated',c.oid,'TRUNCATE'))
 ) into result;
 return result;
end $$;
revoke all on function public.nexo_shield_status() from public,anon;
grant execute on function public.nexo_shield_status() to authenticated;
