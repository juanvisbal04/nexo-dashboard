-- NEXO Internal CRM
-- Admin-only commercial CRM for NEXO prospects and client economics.

alter table public.demo_requests
  add column if not exists stage text not null default 'prospecto',
  add column if not exists expected_mrr numeric(12,2),
  add column if not exists expected_setup_fee numeric(12,2),
  add column if not exists next_action_at timestamptz,
  add column if not exists demo_at timestamptz,
  add column if not exists proposal_sent_at timestamptz,
  add column if not exists organization_id uuid references public.organizations(id) on delete set null,
  add column if not exists lost_reason text,
  add column if not exists crm_notes text;

do $$
begin
  if not exists (
    select 1 from pg_constraint where conname = 'demo_requests_stage_check'
  ) then
    alter table public.demo_requests
      add constraint demo_requests_stage_check
      check (stage in ('prospecto','demo','propuesta','cliente','implementacion','activo','perdido'));
  end if;
end $$;

create index if not exists demo_requests_stage_idx on public.demo_requests(stage);
create index if not exists demo_requests_next_action_idx on public.demo_requests(next_action_at);
create index if not exists demo_requests_org_idx on public.demo_requests(organization_id);

create table if not exists public.organization_commercials (
  organization_id uuid primary key references public.organizations(id) on delete cascade,
  lifecycle_stage text not null default 'implementacion'
    check (lifecycle_stage in ('cliente','implementacion','activo','pausado','cancelado')),
  plan_name text,
  billing_cycle text not null default 'monthly'
    check (billing_cycle in ('monthly','quarterly','annual','one_time','custom')),
  mrr numeric(12,2),
  monthly_cost numeric(12,2),
  setup_fee numeric(12,2),
  implementation_cost numeric(12,2),
  contract_start_date date,
  go_live_date date,
  renewal_date date,
  billing_status text not null default 'pending'
    check (billing_status in ('pending','active','past_due','paused','cancelled')),
  implementation_status text not null default 'pending'
    check (implementation_status in ('pending','discovery','design','configuration','testing','go_live','active','paused')),
  integration_status text not null default 'pending'
    check (integration_status in ('pending','partial','connected','attention','paused')),
  integration_notes text,
  commercial_notes text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

alter table public.organization_commercials enable row level security;

drop policy if exists "platform admins can view organization commercials" on public.organization_commercials;
create policy "platform admins can view organization commercials"
on public.organization_commercials
for select to authenticated
using (private.is_platform_admin());

drop policy if exists "platform admins can insert organization commercials" on public.organization_commercials;
create policy "platform admins can insert organization commercials"
on public.organization_commercials
for insert to authenticated
with check (private.is_platform_admin());

drop policy if exists "platform admins can update organization commercials" on public.organization_commercials;
create policy "platform admins can update organization commercials"
on public.organization_commercials
for update to authenticated
using (private.is_platform_admin())
with check (private.is_platform_admin());

drop policy if exists "platform admins can delete organization commercials" on public.organization_commercials;
create policy "platform admins can delete organization commercials"
on public.organization_commercials
for delete to authenticated
using (private.is_platform_admin());

create table if not exists public.crm_activities (
  id uuid primary key default gen_random_uuid(),
  demo_request_id uuid references public.demo_requests(id) on delete cascade,
  organization_id uuid references public.organizations(id) on delete cascade,
  activity_type text not null default 'note'
    check (activity_type in ('note','call','demo','proposal','followup','status_change','implementation','billing')),
  title text not null,
  details text,
  due_at timestamptz,
  completed_at timestamptz,
  created_by uuid references auth.users(id) on delete set null,
  created_at timestamptz not null default now(),
  constraint crm_activity_parent_check check (demo_request_id is not null or organization_id is not null)
);

alter table public.crm_activities enable row level security;

drop policy if exists "platform admins can manage crm activities" on public.crm_activities;
create policy "platform admins can manage crm activities"
on public.crm_activities
for all to authenticated
using (private.is_platform_admin())
with check (private.is_platform_admin());

create index if not exists crm_activities_demo_idx on public.crm_activities(demo_request_id);
create index if not exists crm_activities_org_idx on public.crm_activities(organization_id);
create index if not exists crm_activities_due_idx on public.crm_activities(due_at);

create table if not exists public.crm_integrations (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.organizations(id) on delete cascade,
  integration_name text not null,
  provider text,
  status text not null default 'pending'
    check (status in ('pending','configuration','connected','attention','paused','disabled')),
  monthly_cost numeric(12,2),
  notes text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

alter table public.crm_integrations enable row level security;

drop policy if exists "platform admins can manage crm integrations" on public.crm_integrations;
create policy "platform admins can manage crm integrations"
on public.crm_integrations
for all to authenticated
using (private.is_platform_admin())
with check (private.is_platform_admin());

create index if not exists crm_integrations_org_idx on public.crm_integrations(organization_id);
create index if not exists crm_integrations_status_idx on public.crm_integrations(status);

-- Existing client: Estética Avanzada. Financial values intentionally remain null until Juan defines them.
insert into public.organization_commercials (
  organization_id,
  lifecycle_stage,
  plan_name,
  billing_cycle,
  billing_status,
  implementation_status,
  integration_status,
  commercial_notes
)
values (
  '08d63e8b-8565-426b-adfb-397a6e543a9c',
  'activo',
  null,
  'monthly',
  'pending',
  'active',
  'connected',
  'Cliente fundador NEXO. Valores comerciales por definir.'
)
on conflict (organization_id) do nothing;
