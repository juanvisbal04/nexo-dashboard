-- NEXO People & Culture activation + task governance alignment
-- Applied live on 2026-10-07.

update public.nexo_departments
set name='Talento Humano / People & Culture',
    description='Reclutamiento, onboarding interno, desarrollo de personas y operaciones de talento.',
    active=true, planned=false, updated_at=now()
where department_key='people_culture';

insert into public.nexo_permissions(permission_key,category,description) values
('people.directory.read','people','Ver directorio interno autorizado de colaboradores'),
('people.recruiting.read','people','Ver candidatos y procesos de reclutamiento'),
('people.recruiting.write','people','Crear y gestionar candidatos y procesos de reclutamiento'),
('people.onboarding.read','people','Ver onboarding interno de colaboradores'),
('people.onboarding.write','people','Crear y gestionar onboarding interno de colaboradores'),
('people.analytics.read','people','Ver métricas agregadas de talento humano')
on conflict (permission_key) do update set category=excluded.category,description=excluded.description;

update public.nexo_team_roles
set name='People & Culture Lead',
    description='Lidera Talento Humano, reclutamiento, onboarding, desarrollo y operaciones de personas.',
    active=true,assignable=true,planned=false,hierarchy_level=40,role_scope='department',
    department_id=(select id from public.nexo_departments where department_key='people_culture'),
    reports_to_role_id=(select id from public.nexo_team_roles where role_key='founder_ceo')
where role_key='people_culture_lead';

insert into public.nexo_team_roles(
  role_key,name,description,active,system_role,department_id,hierarchy_level,role_scope,assignable,planned,reports_to_role_id
) values
('talent_acquisition_specialist','Talent Acquisition Specialist','Gestiona sourcing, screening, entrevistas, candidatos y ofertas.',true,true,(select id from public.nexo_departments where department_key='people_culture'),20,'individual',true,false,(select id from public.nexo_team_roles where role_key='people_culture_lead')),
('people_operations_specialist','People Operations Specialist','Gestiona onboarding interno, documentación, accesos, seguimiento y procesos de personas.',true,true,(select id from public.nexo_departments where department_key='people_culture'),20,'individual',true,false,(select id from public.nexo_team_roles where role_key='people_culture_lead')),
('people_coordinator','People Coordinator','Apoya reclutamiento, onboarding, seguimiento y coordinación administrativa de Talento Humano.',true,true,(select id from public.nexo_departments where department_key='people_culture'),10,'individual',true,false,(select id from public.nexo_team_roles where role_key='people_culture_lead'))
on conflict (role_key) do update set
name=excluded.name,description=excluded.description,active=excluded.active,department_id=excluded.department_id,
hierarchy_level=excluded.hierarchy_level,role_scope=excluded.role_scope,assignable=excluded.assignable,
planned=excluded.planned,reports_to_role_id=excluded.reports_to_role_id;

create table if not exists public.nexo_people_candidates (
  id uuid primary key default gen_random_uuid(),
  full_name text not null,
  email text,
  phone text,
  target_department_id uuid references public.nexo_departments(id) on delete set null,
  target_role_id uuid references public.nexo_team_roles(id) on delete set null,
  position_title text,
  stage text not null default 'sourced',
  source text,
  owner_user_id uuid references auth.users(id) on delete set null,
  next_action_at timestamptz,
  interview_at timestamptz,
  notes text,
  created_by uuid references auth.users(id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint nexo_people_candidates_stage_check check (stage in ('sourced','screening','interview','assessment','offer','hired','rejected','on_hold'))
);
alter table public.nexo_people_candidates enable row level security;
grant select,insert,update on table public.nexo_people_candidates to authenticated;

create table if not exists public.nexo_people_onboarding (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null unique references auth.users(id) on delete cascade,
  owner_user_id uuid references auth.users(id) on delete set null,
  start_date date,
  overall_status text not null default 'pending',
  documents_status text not null default 'pending',
  access_status text not null default 'pending',
  tools_status text not null default 'pending',
  training_status text not null default 'pending',
  role_clarity_status text not null default 'pending',
  notes text,
  created_by uuid references auth.users(id) on delete set null,
  updated_by uuid references auth.users(id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
alter table public.nexo_people_onboarding enable row level security;
grant select,insert,update on table public.nexo_people_onboarding to authenticated;

-- Task assignment integrity now recognizes active NEXO staff in NEXO Internal,
-- and assigned NEXO staff for client organizations. RLS remains authoritative.
-- See live private.validate_task_assignment() and private.validate_work_task_scope().
