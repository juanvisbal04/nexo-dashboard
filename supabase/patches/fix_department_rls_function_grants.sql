-- Fix authenticated access to private RLS helpers used by department-scoped policies.
-- These functions remain unavailable to anon and live in the non-exposed private schema.

grant execute on function private.user_department_has_org(uuid) to authenticated;
grant execute on function private.user_has_department_permission(uuid,text) to authenticated;
grant execute on function private.user_is_same_department(uuid) to authenticated;
grant execute on function private.user_can_manage_department_task(uuid,uuid,text) to authenticated;

revoke execute on function private.user_department_has_org(uuid) from anon;
revoke execute on function private.user_has_department_permission(uuid,text) from anon;
revoke execute on function private.user_is_same_department(uuid) from anon;
revoke execute on function private.user_can_manage_department_task(uuid,uuid,text) from anon;
