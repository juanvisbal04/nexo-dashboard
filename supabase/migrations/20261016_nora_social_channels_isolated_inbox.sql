-- Nora's social conversations are separate from Lía and every NEXO client's data.
-- Applied to NEXO Platform Supabase on 2026-10-16.
create table if not exists public.nora_social_threads (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.organizations(id),
  channel text not null check (channel in ('instagram','facebook')),
  business_account_id text not null,
  sender_id text not null,
  status text not null default 'open' check (status in ('open','human_handoff','closed')),
  product_interest text,
  consent_status text not null default 'pending' check (consent_status in ('pending','accepted','declined')),
  consent_at timestamptz,
  privacy_policy_version text,
  lead_id uuid references public.demo_requests(id),
  memory_summary text,
  last_inbound_at timestamptz,
  last_message_at timestamptz not null default now(),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique(channel,business_account_id,sender_id)
);
create table if not exists public.nora_social_messages (
  id uuid primary key default gen_random_uuid(),
  thread_id uuid not null references public.nora_social_threads(id) on delete cascade,
  channel text not null check (channel in ('instagram','facebook')),
  business_account_id text not null,
  platform_message_id text,
  role text not null check (role in ('user','assistant','system')),
  content text not null default '',
  delivery_status text not null default 'received' check (delivery_status in ('received','pending','sent','failed','skipped')),
  error_code text,
  created_at timestamptz not null default now()
);
create unique index if not exists nora_social_messages_platform_unique
  on public.nora_social_messages(channel,business_account_id,platform_message_id)
  where platform_message_id is not null;
create index if not exists nora_social_threads_org_latest
  on public.nora_social_threads(organization_id,last_message_at desc);
create index if not exists nora_social_messages_thread_latest
  on public.nora_social_messages(thread_id,created_at desc);
alter table public.nora_social_threads enable row level security;
alter table public.nora_social_messages enable row level security;
revoke all on public.nora_social_threads from anon,authenticated;
revoke all on public.nora_social_messages from anon,authenticated;
-- Backend service role only. Before the NEXO dashboard reads these tables,
-- implement scoped policies for explicitly authorized NEXO admin roles.
