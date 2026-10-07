create table if not exists public.nexo_team_invites (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  email text not null,
  role_id uuid references public.nexo_team_roles(id) on delete set null,
  status text not null default 'pending'
    check (status in ('pending','accepted','cancelled')),
  invited_by uuid references auth.users(id) on delete set null,
  sent_at timestamptz not null default now(),
  last_sent_at timestamptz not null default now(),
  accepted_at timestamptz,
  cancelled_at timestamptz,
  resend_count integer not null default 0 check (resend_count >= 0),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create unique index if not exists nexo_team_invites_pending_user_idx
  on public.nexo_team_invites(user_id)
  where status='pending';

create index if not exists nexo_team_invites_email_idx
  on public.nexo_team_invites(lower(email));

create index if not exists nexo_team_invites_status_sent_idx
  on public.nexo_team_invites(status,last_sent_at desc);

create index if not exists nexo_team_invites_invited_by_idx
  on public.nexo_team_invites(invited_by);

create index if not exists nexo_team_invites_role_idx
  on public.nexo_team_invites(role_id);

alter table public.nexo_team_invites enable row level security;

drop policy if exists "platform admins manage nexo team invites" on public.nexo_team_invites;
create policy "platform admins manage nexo team invites"
on public.nexo_team_invites for all to authenticated
using (private.is_platform_admin())
with check (private.is_platform_admin());

grant select,insert,update,delete on public.nexo_team_invites to authenticated;

drop trigger if exists nexo_team_invites_updated_at on public.nexo_team_invites;
create trigger nexo_team_invites_updated_at
before update on public.nexo_team_invites
for each row execute function private.set_updated_at();

drop trigger if exists audit_nexo_team_invites on public.nexo_team_invites;
create trigger audit_nexo_team_invites
after insert or update or delete on public.nexo_team_invites
for each row execute function private.capture_audit_log();
