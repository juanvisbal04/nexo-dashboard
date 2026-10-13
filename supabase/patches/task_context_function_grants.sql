-- Keep the task collaboration helper private and callable only by authenticated policies.
revoke all on function private.user_can_update_nexo_task(uuid) from public, anon;
grant execute on function private.user_can_update_nexo_task(uuid) to authenticated, service_role;
