-- Phase 3 permission hardening
-- Ensure internal permissions only come from active role assignments and active role definitions.
create or replace function public.get_my_nexo_permissions()
returns table(permission_key text)
language sql
stable
set search_path to 'pg_catalog'
as $function$
  select p.permission_key
  from public.nexo_permissions p
  where private.is_platform_admin()
  union
  select rp.permission_key
  from public.nexo_user_roles ur
  join public.nexo_team_roles r on r.id=ur.role_id and r.active
  join public.nexo_role_permissions rp on rp.role_id=ur.role_id
  where ur.user_id=(select auth.uid())
    and ur.active;
$function$;

revoke all on function public.get_my_nexo_permissions() from public;
grant execute on function public.get_my_nexo_permissions() to authenticated;
