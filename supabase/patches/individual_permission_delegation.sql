-- CEO-granted permissions supplement active role permissions; no grants are seeded.
create table public.nexo_user_permissions (
  user_id uuid not null references auth.users(id) on delete cascade,
  permission_key text not null references public.nexo_permissions(permission_key) on delete cascade,
  granted_by uuid not null references auth.users(id),
  created_at timestamptz not null default now(),
  primary key(user_id,permission_key),
  constraint nexo_user_permissions_delegatable check (permission_key ~ '^(crm\.(assigned|all)\.(read|write)|tasks\.(self|team)\.(read|write)|clients\.(assigned\.(read|write)|create)|client_data\.assigned\.(read|write)|assistants\.assigned\.(read|write)|operations\.assigned\.write|projects\.department\.(read|write|create|assign)|people\.(directory\.read|recruiting\.(read|write)|onboarding\.(read|write)|analytics\.read))$')
);
alter table public.nexo_user_permissions enable row level security;
grant select on public.nexo_user_permissions to authenticated;
create policy "CEO and user can read individual permissions" on public.nexo_user_permissions for select to authenticated using (private.is_platform_admin() or user_id=(select auth.uid()));

create or replace function private.user_has_nexo_permission(target_permission text)
returns boolean language sql stable security definer set search_path to 'pg_catalog' as $$
 select (select auth.uid()) is not null and (
   private.is_platform_admin() or exists (
     select 1 from public.nexo_user_roles ur join public.nexo_team_roles r on r.id=ur.role_id and r.active
     where ur.user_id=(select auth.uid()) and ur.active and (
       exists(select 1 from public.nexo_role_permissions rp where rp.role_id=r.id and rp.permission_key=target_permission)
       or exists(select 1 from public.nexo_user_permissions up where up.user_id=ur.user_id and up.permission_key=target_permission)
     )
   )
 );
$$;
create or replace function public.get_my_nexo_permissions()
returns table(permission_key text) language sql stable set search_path to 'pg_catalog' as $$
 select p.permission_key from public.nexo_permissions p where private.is_platform_admin()
 union
 select rp.permission_key from public.nexo_user_roles ur join public.nexo_team_roles r on r.id=ur.role_id and r.active
 join public.nexo_role_permissions rp on rp.role_id=r.id where ur.user_id=(select auth.uid()) and ur.active
 union
 select up.permission_key from public.nexo_user_permissions up where up.user_id=(select auth.uid())
 and exists(select 1 from public.nexo_user_roles ur join public.nexo_team_roles r on r.id=ur.role_id and r.active where ur.user_id=up.user_id and ur.active);
$$;
revoke all on function public.get_my_nexo_permissions() from public;
grant execute on function public.get_my_nexo_permissions() to authenticated;

create function private.set_nexo_user_permissions(target_user uuid, requested_permissions text[])
returns jsonb language plpgsql security definer set search_path to 'pg_catalog' as $$
declare old_permissions text[]; new_permissions text[]; perm text; dependency text; internal_org uuid;
begin
 if (select auth.uid()) is null or not private.is_platform_admin() then raise exception 'Solo el CEO puede asignar permisos individuales' using errcode='42501'; end if;
 if not exists(select 1 from public.profiles where id=target_user and platform_role is distinct from 'platform_admin')
 or not exists(select 1 from public.nexo_user_roles ur join public.nexo_team_roles r on r.id=ur.role_id and r.active where ur.user_id=target_user) then
   raise exception 'Selecciona un colaborador con cargo interno';
 end if;
 -- Serialize competing CEO edits for the same person.
 perform 1 from public.profiles where id=target_user for update;
 select coalesce(array_agg(distinct value),array[]::text[]) into new_permissions from unnest(coalesce(requested_permissions,array[]::text[])) value;
 foreach perm in array new_permissions loop
   if perm is null or not exists(select 1 from public.nexo_permissions where permission_key=perm)
   or perm !~ '^(crm\.(assigned|all)\.(read|write)|tasks\.(self|team)\.(read|write)|clients\.(assigned\.(read|write)|create)|client_data\.assigned\.(read|write)|assistants\.assigned\.(read|write)|operations\.assigned\.write|projects\.department\.(read|write|create|assign)|people\.(directory\.read|recruiting\.(read|write)|onboarding\.(read|write)|analytics\.read))$' then
     raise exception 'Permiso no delegable: %',perm;
   end if;
   if perm='clients.create' then new_permissions:=array(select distinct x from unnest(new_permissions||array['projects.department.create','projects.department.read']) x); end if;
   dependency:=case when perm like '%.write' then regexp_replace(perm,'\.write$','.read') when perm like 'projects.department.%' then 'projects.department.read' else null end;
   if dependency is not null and exists(select 1 from public.nexo_permissions where permission_key=dependency) and not dependency=any(new_permissions) then new_permissions:=array_append(new_permissions,dependency); end if;
 end loop;
 select coalesce(array_agg(permission_key order by permission_key),array[]::text[]) into old_permissions from public.nexo_user_permissions where user_id=target_user;
 delete from public.nexo_user_permissions where user_id=target_user and not permission_key=any(new_permissions);
 insert into public.nexo_user_permissions(user_id,permission_key,granted_by) select target_user,p,(select auth.uid()) from unnest(new_permissions) p on conflict(user_id,permission_key) do nothing;
 select id into internal_org from public.organizations where name='NEXO Internal' limit 1;
 insert into public.audit_log(organization_id,actor_user_id,action,table_name,record_id,old_data,new_data,changed_fields)
 values(internal_org,(select auth.uid()),'UPDATE','nexo_user_permissions',target_user,jsonb_build_object('permissions',old_permissions),jsonb_build_object('permissions',new_permissions),jsonb_build_object('permissions',new_permissions));
 return jsonb_build_object('ok',true,'additional_permissions',new_permissions);
end;
$$;
revoke all on function private.set_nexo_user_permissions(uuid,text[]) from public;
grant execute on function private.set_nexo_user_permissions(uuid,text[]) to authenticated;
create function public.set_nexo_user_permissions(target_user uuid,requested_permissions text[])
returns jsonb language sql security invoker set search_path to 'pg_catalog' as $$ select private.set_nexo_user_permissions(target_user,requested_permissions); $$;
revoke all on function public.set_nexo_user_permissions(uuid,text[]) from public;
grant execute on function public.set_nexo_user_permissions(uuid,text[]) to authenticated;
