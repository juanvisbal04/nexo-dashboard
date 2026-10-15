
-- Archivar pruebas sin eliminar su historial financiero, con RLS y audit_log existentes.
alter table public.client_invoices
  add column if not exists archived_at timestamptz,
  add column if not exists archived_by uuid references auth.users(id) on delete set null,
  add column if not exists archive_reason text;

create or replace function public.archive_test_invoice(p_invoice_id uuid,p_confirmation text,p_reason text)
returns jsonb language plpgsql security invoker set search_path=public,private,pg_temp as $$
declare v public.client_invoices%rowtype;
begin
 if auth.uid() is null or not private.is_platform_admin() then raise exception 'Solo Super Admin.'; end if;
 select * into v from public.client_invoices where id=p_invoice_id for update;
 if not found then raise exception 'Cuenta no encontrada.'; end if;
 if v.archived_at is not null then raise exception 'Ya archivada.'; end if;
 if coalesce(v.invoice_number,v.id::text) is distinct from nullif(btrim(p_confirmation),'') then raise exception 'Confirmacion incorrecta.'; end if;
 if length(btrim(coalesce(p_reason,''))) < 8 then raise exception 'Motivo obligatorio.'; end if;
 if v.status not in ('paid','cancelled','waived') or v.payment_status='pending' then raise exception 'Los cobros abiertos no se pueden archivar.'; end if;
 update public.client_invoices set archived_at=now(),archived_by=auth.uid(),archive_reason=btrim(p_reason),updated_at=now() where id=p_invoice_id;
 return jsonb_build_object('ok',true,'archived_id',p_invoice_id);
end;
$$;
revoke all on function public.archive_test_invoice(uuid,text,text) from public;
grant execute on function public.archive_test_invoice(uuid,text,text) to authenticated;

create or replace function public.restore_archived_invoice(p_invoice_id uuid,p_confirmation text)
returns jsonb language plpgsql security invoker set search_path=public,private,pg_temp as $$
declare v public.client_invoices%rowtype;
begin
 if auth.uid() is null or not private.is_platform_admin() then raise exception 'Solo Super Admin.'; end if;
 select * into v from public.client_invoices where id=p_invoice_id for update;
 if not found or v.archived_at is null then raise exception 'Cuenta archivada no encontrada.'; end if;
 if coalesce(v.invoice_number,v.id::text) is distinct from nullif(btrim(p_confirmation),'') then raise exception 'Confirmacion incorrecta.'; end if;
 update public.client_invoices set archived_at=null,archived_by=null,archive_reason=null,updated_at=now() where id=p_invoice_id;
 return jsonb_build_object('ok',true,'restored_id',p_invoice_id);
end;
$$;
revoke all on function public.restore_archived_invoice(uuid,text) from public;
grant execute on function public.restore_archived_invoice(uuid,text) to authenticated;
