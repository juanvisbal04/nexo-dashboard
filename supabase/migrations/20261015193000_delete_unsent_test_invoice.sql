-- Permitir eliminar pruebas con envio desactivado cuando nunca se enviaron.
create or replace function public.delete_test_invoice(p_invoice_id uuid,p_confirmation text)
returns jsonb language plpgsql security invoker set search_path=public,private,pg_temp as $$
declare v public.client_invoices%rowtype; n bigint;
begin
 if auth.uid() is null or not private.is_platform_admin() then raise exception 'Solo Super Admin.'; end if;
 select * into v from public.client_invoices where id=p_invoice_id for update;
 if not found then raise exception 'Cuenta no encontrada.'; end if;
 if coalesce(v.invoice_number,v.id::text) is distinct from nullif(btrim(p_confirmation),'') then raise exception 'Confirmacion incorrecta.'; end if;
 select count(*) into n from public.invoice_payments where invoice_id=p_invoice_id;
 if v.status not in ('pending','overdue','cancelled') or v.paid_at is not null
 or v.payment_status<>'not_requested' or v.payment_url is not null
 or v.payment_transaction_id is not null or v.email_status='sent'
 or v.email_sent_at is not null or n>0 then
   raise exception 'Cuenta con pago, link, correo enviado o estado protegido.';
 end if;
 delete from public.client_invoices where id=p_invoice_id;
 if not found then raise exception 'No se elimino la prueba.'; end if;
 return jsonb_build_object('ok',true,'invoice_number',v.invoice_number,'deleted_id',v.id);
end;
$$;
revoke all on function public.delete_test_invoice(uuid,text) from public;
grant execute on function public.delete_test_invoice(uuid,text) to authenticated;