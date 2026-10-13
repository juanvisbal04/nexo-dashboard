-- NEXO Shield 360 — founder-only security posture and incident register
-- Applied 2026-10-13 through Supabase to NEXO Platform.
create table if not exists public.nexo_shield_incidents (
 id uuid primary key default gen_random_uuid(),
 title text not null check(char_length(trim(title)) between 5 and 180),
 severity text not null default 'medium' check(severity in('low','medium','high','critical')),
 status text not null default 'open' check(status in('open','investigating','resolved')),
 description text,
 created_by uuid not null references auth.users(id),
 created_at timestamptz not null default now(),
 updated_at timestamptz not null default now(),
 resolved_at timestamptz
);
create index if not exists nexo_shield_incidents_status_idx on public.nexo_shield_incidents(status,created_at desc);
alter table public.nexo_shield_incidents enable row level security;
revoke all on public.nexo_shield_incidents from anon;
grant select,insert,update on public.nexo_shield_incidents to authenticated;
drop policy if exists "founder reads shield incidents" on public.nexo_shield_incidents;
create policy "founder reads shield incidents" on public.nexo_shield_incidents for select to authenticated using(private.is_platform_admin());
drop policy if exists "founder creates shield incidents" on public.nexo_shield_incidents;
create policy "founder creates shield incidents" on public.nexo_shield_incidents for insert to authenticated with check(private.is_platform_admin() and created_by=(select auth.uid()));
drop policy if exists "founder updates shield incidents" on public.nexo_shield_incidents;
create policy "founder updates shield incidents" on public.nexo_shield_incidents for update to authenticated using(private.is_platform_admin()) with check(private.is_platform_admin());
create or replace function public.nexo_shield_status()
returns jsonb language plpgsql stable security definer set search_path='pg_catalog'
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
  'private_storage_buckets',(select count(*) from storage.buckets where public=false),
  'public_storage_buckets',(select count(*) from storage.buckets where public=true),
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
