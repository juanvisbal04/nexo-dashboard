-- Admin-only deletion of unpaid, unsent test accounts; preserves audit and payment history
create or replace function public.delete_test_invoice(p_invoice_id uuid, p_confirmation text)
returns jsonb language plpgsql security invoker
set search_path = public, private, pg_temp as $$
declare
  v_invoice public.client_invoices%rowtype;
  v_attempt_count bigint;
begin
  if auth.uid() is null or not private.is_platform_admin() then
    raise exception 'Solo el Super Admin puede eliminar cuentas de cobro de prueba.';
  end if;
  select * into v_invoice from public.client_invoices where id=p_invoice_id for update;
  if not found then raise exception 'No se encontro la cuenta de cobro.'; end if;
  if nullif(btrim(p_confirmation),'') is distinct from coalesce(v_invoice.invoice_number,v_invoice.id::text) then
    raise exception 'El numero de confirmacion no coincide.';
  end if;
  select count(*) into v_attempt_count from public.invoice_payments where invoice_id=p_invoice_id;
  if v_invoice.status not in ('pending','overdue','cancelled')
      or v_invoice.paid_at is not null
      or v_invoice.payment_status <> 'not_requested'
      or v_invoice.payment_url is not null
      or v_invoice.payment_transaction_id is not null
      or v_invoice.email_status in ('sent','disabled')
      or v_invoice.email_sent_at is not null
      or v_attempt_count > 0 then
    raise exception 'Esta cuenta tiene actividad de pago o correo, o un estado protegido. Anulala o conservala para auditoria.';
  end if;
  delete from public.client_invoices where id=p_invoice_id;
  if not found then raise exception 'La eliminacion no pudo completarse.'; end if;
  return jsonb_build_object('ok',true,'invoice_number',v_invoice.invoice_number,'deleted_id',v_invoice.id);
end;
$$;
revoke all on function public.delete_test_invoice(uuid,text) from public;
grant execute on function public.delete_test_invoice(uuid,text) to authenticated;
