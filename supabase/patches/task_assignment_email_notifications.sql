-- Automated task assignment emails for NEXO.
-- Secret value is stored only in Supabase Vault under:
--   resend_task_notifications_api_key
-- Never place the actual Resend token in source control.

create extension if not exists pg_net;

create table if not exists private.task_email_notifications (
  id uuid primary key default gen_random_uuid(),
  task_id uuid not null,
  recipient_user_id uuid not null,
  recipient_email text not null,
  event_type text not null check (event_type in ('assigned','reassigned')),
  request_id bigint,
  created_at timestamptz not null default now()
);

revoke all on table private.task_email_notifications from public, anon, authenticated;

create or replace function private.html_escape(input text)
returns text
language sql
immutable
strict
set search_path = ''
as $$
  select replace(
    replace(
      replace(
        replace(
          replace(input, '&', '&amp;'),
          '<', '&lt;'
        ),
        '>', '&gt;'
      ),
      '"', '&quot;'
    ),
    '''', '&#39;'
  );
$$;

revoke all on function private.html_escape(text) from public, anon, authenticated;

create or replace function private.notify_task_assignment_email()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_actor uuid := auth.uid();
  v_recipient_email text;
  v_recipient_name text;
  v_assigner_name text;
  v_org_name text;
  v_department_name text;
  v_api_key text;
  v_request_id bigint;
  v_event_type text;
  v_due_text text;
  v_subject text;
  v_html text;
  v_text text;
begin
  if new.assigned_to is null then return new; end if;
  if tg_op='UPDATE' and new.assigned_to is not distinct from old.assigned_to then return new; end if;
  if v_actor is not null and new.assigned_to=v_actor then return new; end if;
  if tg_op='INSERT' and v_actor is null and new.created_by is not null and new.assigned_to=new.created_by then return new; end if;

  select p.contact_email, coalesce(nullif(p.full_name,''),p.contact_email,'Colaborador NEXO')
  into v_recipient_email,v_recipient_name
  from public.profiles p
  where p.id=new.assigned_to;

  if v_recipient_email is null or position('@' in v_recipient_email)=0 then return new; end if;

  select coalesce(nullif(p.full_name,''),'NEXO')
  into v_assigner_name
  from public.profiles p
  where p.id=coalesce(v_actor,new.created_by);

  select o.name into v_org_name
  from public.organizations o
  where o.id=new.organization_id;

  select d.name into v_department_name
  from public.nexo_user_roles ur
  join public.nexo_team_roles r on r.id=ur.role_id and r.active=true
  left join public.nexo_departments d on d.id=r.department_id
  where ur.user_id=new.assigned_to and ur.active=true
  order by r.hierarchy_level desc
  limit 1;

  select decrypted_secret into v_api_key
  from vault.decrypted_secrets
  where name='resend_task_notifications_api_key'
  limit 1;

  if v_api_key is null then return new; end if;

  v_event_type:=case when tg_op='INSERT' then 'assigned' else 'reassigned' end;
  v_due_text:=case when new.due_at is null then 'Sin fecha límite'
    else to_char(new.due_at at time zone 'America/Bogota','DD/MM/YYYY · HH24:MI') end;

  v_subject:=case when v_event_type='reassigned'
    then 'Tarea reasignada en NEXO · '||left(coalesce(new.title,'Nueva tarea'),90)
    else 'Nueva tarea asignada en NEXO · '||left(coalesce(new.title,'Nueva tarea'),90)
  end;

  v_text:=
    'NEXO by Juan Visbal'||E'\n\n'||
    case when v_event_type='reassigned' then 'TAREA REASIGNADA' else 'NUEVA TAREA ASIGNADA' end||E'\n'||
    'Hola '||coalesce(v_recipient_name,'')||','||E'\n\n'||
    coalesce(v_assigner_name,'NEXO')||' te asignó una tarea:'||E'\n'||
    coalesce(new.title,'Nueva tarea')||E'\n\n'||
    'Prioridad: '||initcap(coalesce(new.priority,'medium'))||E'\n'||
    'Fecha límite: '||v_due_text||E'\n'||
    'Cuenta: '||coalesce(v_org_name,'NEXO')||E'\n'||
    case when v_department_name is not null then 'Departamento: '||v_department_name||E'\n' else '' end||
    E'\n'||coalesce(nullif(new.description,''),'Sin notas adicionales.')||E'\n\n'||
    'Revisar tarea: https://dashboard.nexobyjv.online/'||E'\n';

  v_html:=format(
    '<!doctype html><html><body style="margin:0;background:#f4f7fb;font-family:Arial,Helvetica,sans-serif;color:#172A46;">
    <table width="100%%" cellpadding="0" cellspacing="0" role="presentation" style="background:#f4f7fb;width:100%%;"><tr><td align="center" style="padding:34px 16px;">
    <table width="100%%" cellpadding="0" cellspacing="0" role="presentation" style="max-width:620px;background:#fff;border-radius:18px;overflow:hidden;">
    <tr><td style="background:#111D35;padding:28px 32px;"><table width="100%%" role="presentation"><tr>
    <td style="font-size:25px;font-weight:700;color:#fff;letter-spacing:1px;">NE<span style="color:#3E7BFF;">X</span>O</td>
    <td align="right" style="font-size:11px;font-weight:600;color:#AAB8CE;">by Juan Visbal</td></tr></table></td></tr>
    <tr><td style="padding:34px 32px 8px;font-size:11px;font-weight:700;color:#3E7BFF;letter-spacing:1.1px;">%s</td></tr>
    <tr><td style="padding:0 32px;font-size:27px;line-height:35px;font-weight:700;color:#172A46;">Hola %s.</td></tr>
    <tr><td style="padding:14px 32px 0;font-size:15px;line-height:23px;color:#5F6F85;">%s te asignó trabajo dentro de NEXO. Revísalo y mantenlo actualizado desde tu workspace.</td></tr>
    <tr><td style="padding:24px 32px 0;"><table width="100%%" role="presentation" style="background:#F6F8FC;border-radius:12px;"><tr><td style="padding:18px;">
    <div style="font-size:11px;font-weight:700;color:#7A8AA1;letter-spacing:.7px;">TAREA</div>
    <div style="font-size:18px;line-height:25px;font-weight:700;color:#263D5D;margin-top:5px;">%s</div>
    <div style="font-size:13px;line-height:20px;color:#65758B;margin-top:13px;"><strong>Prioridad:</strong> %s<br><strong>Fecha límite:</strong> %s<br><strong>Cuenta:</strong> %s%s</div>
    </td></tr></table></td></tr>
    <tr><td style="padding:20px 32px 0;font-size:13px;line-height:21px;color:#65758B;"><strong style="color:#2D4567;">Notas / contexto</strong><br>%s</td></tr>
    <tr><td align="center" style="padding:30px 32px 8px;"><a href="https://dashboard.nexobyjv.online/" style="display:inline-block;background:#316BFF;color:#fff;text-decoration:none;font-size:14px;font-weight:700;padding:14px 26px;border-radius:9px;">Revisar tarea en NEXO</a></td></tr>
    <tr><td style="padding:30px 32px 32px;"><table width="100%%" role="presentation" style="border-top:1px solid #E7ECF3;"><tr>
    <td style="padding-top:18px;font-size:11px;line-height:17px;color:#95A1B2;">NEXO by Juan Visbal<br>Conectamos tu negocio con tus clientes.</td>
    <td align="right" style="padding-top:18px;font-size:11px;color:#95A1B2;">nexobyjv.online</td>
    </tr></table></td></tr></table></td></tr></table></body></html>',
    case when v_event_type='reassigned' then 'TAREA REASIGNADA' else 'NUEVA TAREA ASIGNADA' end,
    private.html_escape(coalesce(v_recipient_name,'Colaborador NEXO')),
    private.html_escape(coalesce(v_assigner_name,'NEXO')),
    private.html_escape(coalesce(new.title,'Nueva tarea')),
    private.html_escape(initcap(coalesce(new.priority,'medium'))),
    private.html_escape(v_due_text),
    private.html_escape(coalesce(v_org_name,'NEXO')),
    case when v_department_name is not null then '<br><strong>Departamento:</strong> '||private.html_escape(v_department_name) else '' end,
    private.html_escape(coalesce(nullif(new.description,''),'Sin notas adicionales.'))
  );

  select net.http_post(
    url:='https://api.resend.com/emails',
    headers:=jsonb_build_object('Authorization','Bearer '||v_api_key,'Content-Type','application/json'),
    body:=jsonb_build_object(
      'from','NEXO by Juan Visbal <equipo@nexobyjv.online>',
      'to',jsonb_build_array(v_recipient_email),
      'reply_to','equipo@nexobyjv.online',
      'subject',v_subject,
      'html',v_html,
      'text',v_text
    )
  ) into v_request_id;

  insert into private.task_email_notifications(task_id,recipient_user_id,recipient_email,event_type,request_id)
  values(new.id,new.assigned_to,v_recipient_email,v_event_type,v_request_id);

  return new;
end;
$$;

revoke all on function private.notify_task_assignment_email() from public, anon, authenticated;

drop trigger if exists notify_task_assignment_email on public.work_tasks;
create trigger notify_task_assignment_email
after insert or update of assigned_to on public.work_tasks
for each row execute function private.notify_task_assignment_email();
