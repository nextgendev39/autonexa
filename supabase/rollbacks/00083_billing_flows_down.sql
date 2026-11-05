-- Reverses 00083. See 00082_down, which refuses to run while gateway billing records exist.

create or replace function public.platform_subscription_sweep()
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_row record;
  v_days integer;
  v_notice integer;
  v_notices integer := 0;
  v_past_due integer := 0;
  v_expired integer := 0;
begin
  for v_row in
    select s.id, s.tenant_id, s.current_period_end, s.expiry_notice_days, p.name as plan_name
    from public.tenant_subscriptions s
    join public.plans p on p.id = s.plan_id
    where s.status in ('trialing', 'active')
      and s.current_period_end is not null
      and s.current_period_end > now()
      and s.current_period_end <= now() + interval '14 days'
    for update of s skip locked
  loop
    v_days := ceil(extract(epoch from v_row.current_period_end - now()) / 86400)::integer;
    v_notice := case when v_days <= 1 then 1 when v_days <= 7 then 7 else 14 end;
    if v_row.expiry_notice_days is null or v_notice < v_row.expiry_notice_days then
      update public.tenant_subscriptions set expiry_notice_days = v_notice where id = v_row.id;
      perform public.notify_tenant_admins(
        v_row.tenant_id, 'subscription_expiring', 'Subscription ending soon',
        format('Your %s subscription ends on %s.', v_row.plan_name, to_char(v_row.current_period_end, 'DD Mon YYYY')),
        jsonb_build_object('plan', v_row.plan_name, 'periodEnd', v_row.current_period_end, 'days', v_days)
      );
      v_notices := v_notices + 1;
    end if;
  end loop;

  for v_row in
    select s.id, s.tenant_id, p.name as plan_name, p.grace_days
    from public.tenant_subscriptions s
    join public.plans p on p.id = s.plan_id
    where s.status in ('trialing', 'active')
      and s.current_period_end <= now()
    for update of s skip locked
  loop
    update public.tenant_subscriptions set status = 'past_due' where id = v_row.id;
    perform public.notify_tenant_admins(
      v_row.tenant_id, 'subscription_past_due', 'Subscription period ended',
      format('Your %s subscription period has ended. Renew within %s days to avoid interruption.', v_row.plan_name, v_row.grace_days),
      jsonb_build_object('plan', v_row.plan_name, 'graceDays', v_row.grace_days)
    );
    v_past_due := v_past_due + 1;
  end loop;

  for v_row in
    select s.id, s.tenant_id, p.name as plan_name
    from public.tenant_subscriptions s
    join public.plans p on p.id = s.plan_id
    where s.status = 'past_due'
      and s.current_period_end + make_interval(days => p.grace_days) <= now()
    for update of s skip locked
  loop
    update public.tenant_subscriptions set status = 'expired', ended_at = now() where id = v_row.id;
    perform public.notify_tenant_admins(
      v_row.tenant_id, 'subscription_expired', 'Subscription expired',
      format('Your %s subscription has expired. Existing records stay available, and new ones are paused until you renew.', v_row.plan_name),
      jsonb_build_object('plan', v_row.plan_name)
    );
    v_expired := v_expired + 1;
  end loop;

  return jsonb_build_object('notices', v_notices, 'pastDue', v_past_due, 'expired', v_expired);
end;
$$;

create or replace function public.platform_record_payment(
  p_invoice_id uuid,
  p_amount numeric,
  p_method text default 'manual',
  p_reference text default null,
  p_notes text default null,
  p_occurred_at timestamptz default null
)
returns uuid
language plpgsql
security definer
set search_path = public
as $$
declare
  v_invoice public.subscription_invoices%rowtype;
  v_id uuid;
  v_total numeric;
begin
  if not public.has_platform_permission('billing.manage') then
    raise exception 'not authorized' using errcode = '42501';
  end if;
  select * into v_invoice from public.subscription_invoices where id = p_invoice_id for update;
  if not found then
    raise exception 'invoice not found' using errcode = 'P0002';
  end if;
  if v_invoice.status in ('void', 'draft') then
    raise exception 'a % invoice cannot take payments', v_invoice.status using errcode = '22023';
  end if;

  insert into public.subscription_transactions
    (tenant_id, invoice_id, amount, currency, method, reference, notes, occurred_at, recorded_by)
  values
    (v_invoice.tenant_id, p_invoice_id, p_amount, v_invoice.currency, p_method, p_reference, p_notes,
     coalesce(p_occurred_at, now()), auth.uid())
  returning id into v_id;

  select coalesce(sum(amount), 0) into v_total
  from public.subscription_transactions where invoice_id = p_invoice_id;

  if v_invoice.status = 'issued' and v_total >= v_invoice.amount then
    update public.subscription_invoices set status = 'paid', paid_at = now() where id = p_invoice_id;
  end if;

  return v_id;
end;
$$;

drop function public.platform_billing_report(integer);
drop function public.billing_generate_renewal_invoices(boolean);
drop function public.billing_compute_renewal(uuid, uuid, text, uuid);
drop function public.billing_schedule_change(uuid, text);
drop function public.billing_set_cancel_at_period_end(boolean);
drop function public.billing_record_external_refund(text, text, text, bigint, boolean);
drop function public.billing_finish_refund(uuid, boolean, text, text);
drop function public.platform_prepare_refund(uuid, numeric, text);
drop function public.billing_expire_checkout(text, uuid);
drop function public.billing_record_failure(text, uuid, text, bigint, text, text, boolean);
drop function public.billing_apply_payment(text, uuid, text, text, bigint, text, boolean, timestamptz);
drop function public.billing_activate(public.billing_checkouts, public.subscription_invoices);
drop function public.billing_attach_session(uuid, text);
drop function public.billing_pay_invoice(uuid, uuid, text, boolean, uuid);
drop function public.billing_prepare_checkout(uuid, uuid, text, text, boolean, uuid);
drop function public.billing_issue_invoice(uuid, uuid, text, jsonb, boolean, uuid, timestamptz);
drop function public.billing_quote(uuid, text);
drop function public.billing_compute(uuid, uuid, text);
drop function public.billing_plan_rank(uuid, text);
