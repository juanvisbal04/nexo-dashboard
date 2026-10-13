-- NEXO: notify collaborators when genuinely new client assignments are created.
-- Reuses the secured Resend credential already configured for task emails.
create table if not exists private.client_assignment_email_notifications (
  id bigint generated always as identity primary key,
  organization_id uuid not null,
  user_id uuid not null,
  assignment_type text not null,
  recipient_email text,
  event_type text not null default 'assigned',
  status text not null,
  request_id bigint,
  created_at timestamptz not null default now()
);
revoke all on private.client_assignment_email_notifications from public, anon, authenticated;

create or replace function private.notify_client_assignment_email()
returns trigger language plpgsql security definer set search_path='' as $fn$
declare
  v_recipient text;
  v_person text;
  v_actor text;
  v_client text;
  v_division text;
  v_type text;
  v_key text;
  v_subject text;
  v_html text;
  v_plain text;
  v_request bigint;
begin
  -- Assignment rows for NEXO Internal are not client assignments.
  select o.name,
    case when 'marketing'=any(o.service_lines) and not ('assistants'=any(o.service_lines) or 'solutions'=any(o.service_lines)) then 'NEXO Marketing'
         when 'marketing'=any(o.service_lines) then 'NEXO · Asistentes, Soluciones y Marketing'
         else 'NEXO · Asistentes y Soluciones' end
    into v_client,v_division
  from public.organizations o where o.id=new.organization_id and o.name<>'NEXO Internal';
  if v_client is null then return new; end if;

  if new.assigned_by is not null and new.user_id=new.assigned_by then return new; end if;
  select nullif(btrim(p.contact_email),''),coalesce(nullif(btrim(p.full_name),''),'Colaborador NEXO')
    into v_recipient,v_person from public.profiles p where p.id=new.user_id;
  if v_recipient is null or position('@' in v_recipient)=0 then
    insert into private.client_assignment_email_notifications
      (organization_id,user_id,assignment_type,recipient_email,status)
    values(new.organization_id,new.user_id,new.assignment_type,v_recipient,'skipped_no_email');
    return new;
  end if;

  select coalesce(nullif(btrim(p.full_name),''),'NEXO') into v_actor
    from public.profiles p where p.id=new.assigned_by;
  v_actor:=coalesce(v_actor,'NEXO');
  v_type:=case new.assignment_type
    when 'sales' then 'Ventas' when 'marketing' then 'Marketing'
    when 'implementation' then 'Implementación'
    when 'operations' then 'Operaciones'
    when 'account_owner' then 'Responsable de cuenta'
    when 'support' then 'Soporte'
    else 'Colaborador' end;
  select decrypted_secret into v_key from vault.decrypted_secrets
    where name='resend_task_notifications_api_key' limit 1;
  if v_key is null then
    insert into private.client_assignment_email_notifications
      (organization_id,user_id,assignment_type,recipient_email,status)
    values(new.organization_id,new.user_id,new.assignment_type,v_recipient,'skipped_no_mail_key');
    return new;
  end if;

  v_subject:='Nueva cuenta asignada en NEXO · '||left(v_client,100);
  v_plain:='NEXO by Juan Visbal'||E'\n\n'||
    'Hola '||v_person||','||E'\n\n'||
    v_actor||' te asignó una nueva cuenta en NEXO.'||E'\n\n'||
    'Cliente: '||v_client||E'\n'||
    'División: '||v_division||E'\n'||
    'Responsabilidad: '||v_type||E'\n\n'||
    'Revisa los detalles desde tu workspace, según tus permisos:'||E'\n'||
    'https://dashboard.nexobyjv.online/'||E'\n\n'||
    'Conectamos tu negocio con tus clientes.';

  v_html:=format(
    '<!doctype html><html lang="es"><body style="margin:0;background:#f4f7fb;font-family:Arial,Helvetica,sans-serif;color:#172a46;">
    <table role="presentation" cellpadding="0" cellspacing="0" style="width:100%%;background:#f4f7fb;"><tr><td align="center" style="padding:32px 14px;">
    <table role="presentation" cellpadding="0" cellspacing="0" style="width:100%%;max-width:600px;background:#ffffff;border-radius:16px;">
    <tr><td style="background:#111d35;padding:25px 30px;color:#ffffff;font-size:25px;font-weight:bold;letter-spacing:1px;">NE<span style="color:#3e7bff;">X</span>O <span style="font-size:12px;font-weight:normal;">by Juan Visbal</span></td></tr>
    <tr><td style="padding:30px 30px 10px;color:#316bff;font-size:12px;font-weight:bold;">NUEVA CUENTA ASIGNADA</td></tr>
    <tr><td style="padding:0 30px;font-size:25px;font-weight:bold;">Hola, %s.</td></tr>
    <tr><td style="padding:18px 30px;font-size:15px;line-height:24px;color:#53657b;">%s te asignó una nueva cuenta para gestionar desde tu workspace de NEXO.</td></tr>
    <tr><td style="padding:6px 30px;"><div style="background:#f4f7fb;padding:20px;border-radius:12px;">
    <div style="font-size:12px;color:#708098;">CLIENTE</div><div style="font-size:20px;font-weight:bold;margin-top:6px;">%s</div>
    <div style="font-size:14px;line-height:26px;margin-top:14px;"><b>División:</b> %s<br><b>Responsabilidad:</b> %s<br><b>Asignado por:</b> %s</div></div></td></tr>
    <tr><td align="center" style="padding:30px;"><a href="https://dashboard.nexobyjv.online/" style="display:inline-block;padding:15px 23px;background:#316bff;border-radius:9px;color:#ffffff;font-size:14px;font-weight:bold;text-decoration:none;">Ver mis cuentas en NEXO</a>
    <p style="font-size:12px;color:#748297;line-height:19px;">El acceso a cada módulo depende de los permisos de tu usuario.</p></td></tr>
    <tr><td style="padding:0 30px 28px;font-size:11px;color:#95a1b2;">NEXO by Juan Visbal · Conectamos tu negocio con tus clientes.</td></tr>
    </table></td></tr></table></body></html>',
    private.html_escape(v_person),private.html_escape(v_actor),
    private.html_escape(v_client),private.html_escape(v_division),
    private.html_escape(v_type),private.html_escape(v_actor));

  select net.http_post(
    url:='https://api.resend.com/emails',
    headers:=jsonb_build_object('Authorization','Bearer '||v_key,'Content-Type','application/json'),
    body:=jsonb_build_object('from','NEXO by Juan Visbal <equipo@nexobyjv.online>',
      'to',jsonb_build_array(v_recipient),'reply_to','equipo@nexobyjv.online',
      'subject',v_subject,'html',v_html,'text',v_plain)
    ) into v_request;

  insert into private.client_assignment_email_notifications
    (organization_id,user_id,assignment_type,recipient_email,event_type,status,request_id)
  values(new.organization_id,new.user_id,new.assignment_type,v_recipient,'assigned','queued',v_request);
  return new;
exception when others then
  -- Do not reject a client assignment because an external mail provider is unavailable.
  raise warning 'NEXO_CLIENT_ASSIGNMENT_EMAIL_ERROR: %',sqlerrm;
  return new;
end
$fn$;

revoke all on function private.notify_client_assignment_email() from public, anon, authenticated;
drop trigger if exists notify_client_assignment_email on public.nexo_client_assignments;
create trigger notify_client_assignment_email
after insert on public.nexo_client_assignments
for each row execute function private.notify_client_assignment_email();