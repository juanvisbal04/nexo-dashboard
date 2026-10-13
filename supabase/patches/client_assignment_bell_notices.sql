-- NEXO client assignment notification stream (only future assignments).
create table if not exists public.nexo_client_assignment_notices (
  id uuid primary key default gen_random_uuid(),
  recipient_user_id uuid not null references auth.users(id) on delete cascade,
  organization_id uuid not null references public.organizations(id) on delete cascade,
  assignment_type text not null,
  assigned_by uuid references auth.users(id) on delete set null,
  created_at timestamptz not null default now()
);
create index if not exists nexo_client_assignment_notices_recipient_idx
  on public.nexo_client_assignment_notices(recipient_user_id,created_at desc);
alter table public.nexo_client_assignment_notices enable row level security;
revoke all on public.nexo_client_assignment_notices from public, anon, authenticated;
grant select on public.nexo_client_assignment_notices to authenticated;
drop policy if exists "Recipients see their own new client assignments" on public.nexo_client_assignment_notices;
create policy "Recipients see their own new client assignments"
  on public.nexo_client_assignment_notices for select to authenticated
  using (recipient_user_id=(select auth.uid()));

create or replace function private.record_client_assignment_notice()
returns trigger language plpgsql security definer set search_path='' as $fn$
begin
  if new.assigned_by is not null and new.user_id=new.assigned_by then return new; end if;
  if exists(select 1 from public.organizations where id=new.organization_id and name<>'NEXO Internal') then
    insert into public.nexo_client_assignment_notices
      (recipient_user_id,organization_id,assignment_type,assigned_by)
    values(new.user_id,new.organization_id,new.assignment_type,new.assigned_by);
  end if;
  return new;
end
$fn$;
revoke all on function private.record_client_assignment_notice() from public, anon, authenticated;
drop trigger if exists record_client_assignment_notice on public.nexo_client_assignments;
create trigger record_client_assignment_notice
  after insert on public.nexo_client_assignments
  for each row execute function private.record_client_assignment_notice();