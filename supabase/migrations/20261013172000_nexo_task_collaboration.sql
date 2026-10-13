-- NEXO task collaboration migration. Safe to rerun.
create table if not exists public.nexo_task_comments(
 id uuid primary key default gen_random_uuid(),
 task_id uuid not null references public.work_tasks(id) on delete cascade,
 author_id uuid not null references auth.users(id),
 body text not null check(length(trim(body)) between 1 and 4000),
 created_at timestamptz not null default now()
);
create index if not exists nexo_task_comments_task_idx on public.nexo_task_comments(task_id,created_at desc);
create table if not exists public.nexo_task_checklist(
 id uuid primary key default gen_random_uuid(),
 task_id uuid not null references public.work_tasks(id) on delete cascade,
 title text not null check(length(trim(title)) between 1 and 250),
 is_done boolean not null default false,
 created_by uuid not null references auth.users(id),
 completed_by uuid references auth.users(id),
 created_at timestamptz not null default now(),
 updated_at timestamptz not null default now()
);
create index if not exists nexo_task_checklist_task_idx on public.nexo_task_checklist(task_id,created_at);
alter table public.nexo_task_comments enable row level security;
alter table public.nexo_task_checklist enable row level security;
grant select,insert on public.nexo_task_comments to authenticated;
grant select,insert,update,delete on public.nexo_task_checklist to authenticated;
create or replace function private.user_can_update_nexo_task(target_task uuid) returns boolean
language sql stable security definer set search_path='pg_catalog' as $$
select (select auth.uid()) is not null and exists(
 select 1 from public.work_tasks t where t.id=target_task and(
 private.is_platform_admin() or private.user_can_write_org(t.organization_id)
 or (t.assigned_to=(select auth.uid()) and private.user_has_nexo_permission('tasks.self.write'))
 or private.user_can_manage_department_task(t.assigned_to,t.organization_id,'tasks.team.write')
 )
);
$$;
drop policy if exists "task members read comments" on public.nexo_task_comments;
create policy "task members read comments" on public.nexo_task_comments for select to authenticated
 using(exists(select 1 from public.work_tasks t where t.id=task_id));
drop policy if exists "task editors add comments" on public.nexo_task_comments;
create policy "task editors add comments" on public.nexo_task_comments for insert to authenticated
 with check(author_id=(select auth.uid()) and private.user_can_update_nexo_task(task_id));
drop policy if exists "task members read checklist" on public.nexo_task_checklist;
create policy "task members read checklist" on public.nexo_task_checklist for select to authenticated
 using(exists(select 1 from public.work_tasks t where t.id=task_id));
drop policy if exists "task editors add checklist" on public.nexo_task_checklist;
create policy "task editors add checklist" on public.nexo_task_checklist for insert to authenticated
 with check(created_by=(select auth.uid()) and private.user_can_update_nexo_task(task_id));
drop policy if exists "task editors modify checklist" on public.nexo_task_checklist;
create policy "task editors modify checklist" on public.nexo_task_checklist for update to authenticated
 using(private.user_can_update_nexo_task(task_id)) with check(private.user_can_update_nexo_task(task_id));
drop policy if exists "task editors remove checklist" on public.nexo_task_checklist;
create policy "task editors remove checklist" on public.nexo_task_checklist for delete to authenticated
 using(private.user_can_update_nexo_task(task_id));
insert into storage.buckets(id,name,public,file_size_limit,allowed_mime_types) values(
 'nexo-task-files','nexo-task-files',false,10485760,
 array['application/pdf','image/jpeg','image/png','image/webp','text/plain','text/csv',
 'application/msword','application/vnd.openxmlformats-officedocument.wordprocessingml.document',
 'application/vnd.ms-excel','application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
 'application/vnd.ms-powerpoint','application/vnd.openxmlformats-officedocument.presentationml.presentation'])
on conflict(id) do nothing;
drop policy if exists "task members read private attachments" on storage.objects;
create policy "task members read private attachments" on storage.objects for select to authenticated
 using(bucket_id='nexo-task-files'
 and (storage.foldername(name))[1] ~ '^[0-9a-f-]{36}$'
 and exists(select 1 from public.work_tasks t where t.id=((storage.foldername(name))[1])::uuid));
drop policy if exists "task editors upload private attachments" on storage.objects;
create policy "task editors upload private attachments" on storage.objects for insert to authenticated
 with check(bucket_id='nexo-task-files'
 and (storage.foldername(name))[1] ~ '^[0-9a-f-]{36}$'
 and private.user_can_update_nexo_task(((storage.foldername(name))[1])::uuid));
drop policy if exists "task editors remove private attachments" on storage.objects;
create policy "task editors remove private attachments" on storage.objects for delete to authenticated
 using(bucket_id='nexo-task-files'
 and (storage.foldername(name))[1] ~ '^[0-9a-f-]{36}$'
 and private.user_can_update_nexo_task(((storage.foldername(name))[1])::uuid));
