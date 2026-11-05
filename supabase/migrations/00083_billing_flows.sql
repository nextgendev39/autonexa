-- SaaS Phase 5: money movements. The rule throughout: only a verified payment changes a plan, and
-- it does so in one transaction with the record of that payment. A checkout changes nothing.
-- Rollback: supabase/rollbacks/00083_billing_flows_down.sql

-- ---------------------------------------------------------------------------
-- What a change would cost
-- ---------------------------------------------------------------------------

create function public.billing_plan_rank(p_plan_id uuid, p_currency text)
returns numeric
language sql
stable
security definer
set search_path = public
as $$
  select coalesce(public.plan_price(p_plan_id, p_currency, 'monthly'), public.plan_price(p_plan_id, p_currency, 'yearly') / 12);
$$;

-- Everything a checkout needs, worked out on the server. Prices and credit are never sent by a client.
create function public.billing_compute(p_tenant_id uuid, p_plan_id uuid, p_cycle text)
returns jsonb
language plpgsql
stable
security definer
set search_path = public
as $$
declare
  v_profile public.tenant_billing_profiles%rowtype;
  v_tax public.billing_tax_rates%rowtype;
  v_entity public.billing_entities%rowtype;
  v_current public.tenant_subscriptions%rowtype;
  v_plan public.plans%rowtype;
  v_price numeric;
  v_kind text := 'new';
  v_credit numeric := 0;
  v_paid numeric;
  v_paid_start date;
  v_taxable numeric;
  v_tax_amount numeric;
  v_share numeric;
begin
  select * into v_profile from public.tenant_billing_profiles where tenant_id = p_tenant_id;
  if not found then
    return jsonb_build_object('error', 'profile_required');
  end if;
  select * into v_plan from public.plans where id = p_plan_id and is_active;
  if not found then
    return jsonb_build_object('error', 'plan_not_available');
  end if;
  if p_cycle not in ('monthly', 'yearly') then
    return jsonb_build_object('error', 'cycle_invalid');
  end if;
  v_price := public.plan_price(p_plan_id, v_profile.currency, p_cycle);
  if v_price is null then
    return jsonb_build_object('error', 'price_not_set');
  end if;
  select * into v_tax from public.billing_tax_rates where country = v_profile.country;
  if not found then
    return jsonb_build_object('error', 'tax_not_configured');
  end if;
  select * into v_entity from public.billing_entities where currency = v_profile.currency;
  if not found then
    return jsonb_build_object('error', 'seller_not_configured');
  end if;

  select * into v_current from public.tenant_subscriptions
  where tenant_id = p_tenant_id and status in ('active', 'past_due')
  order by created_at desc, id limit 1;

  if v_current.id is not null then
    if v_current.plan_id = p_plan_id and v_current.billing_cycle = p_cycle then
      v_kind := 'renewal';
    elsif public.billing_plan_rank(p_plan_id, v_profile.currency) < public.billing_plan_rank(v_current.plan_id, v_profile.currency)
       or (v_current.plan_id = p_plan_id and v_current.billing_cycle = 'yearly' and p_cycle = 'monthly') then
      -- Already paid for the bigger thing until the period ends, so it waits until then.
      return jsonb_build_object('error', 'schedule_downgrade');
    else
      v_kind := 'upgrade';
      -- The unused part of what was last paid for, in the same currency, comes off.
      if v_current.current_period_end > now() then
        select i.subtotal - i.credit_amount, i.created_at::date into v_paid, v_paid_start
        from public.subscription_invoices i
        where i.subscription_id = v_current.id and i.status = 'paid' and i.currency = v_profile.currency
          and i.subtotal is not null and i.is_test = v_current.is_test
        order by i.created_at desc limit 1;
        -- Measured against one paid period, because started_at keeps its age across renewals.
        if v_paid is not null then
          v_share := extract(epoch from v_current.current_period_end - now())
            / extract(epoch from v_current.current_period_end - (
                v_current.current_period_end
                - case v_current.billing_cycle when 'yearly' then interval '1 year' else interval '1 month' end
              ));
          v_credit := round(v_paid * least(greatest(v_share, 0), 1), 2);
        end if;
      end if;
    end if;
  end if;

  v_taxable := v_price - v_credit;
  if v_taxable <= 0 then
    return jsonb_build_object('error', 'credit_exceeds_price');
  end if;
  v_tax_amount := round(v_taxable * v_tax.rate / 100, 2);

  return jsonb_build_object(
    'kind', v_kind,
    'planName', v_plan.name,
    'currency', v_profile.currency,
    'subtotal', v_price,
    'credit', v_credit,
    'taxLabel', v_tax.label,
    'taxRate', v_tax.rate,
    'tax', v_tax_amount,
    'total', v_taxable + v_tax_amount,
    'subscriptionId', v_current.id
  );
end;
$$;

revoke all on function public.billing_plan_rank(uuid, text) from public, anon, authenticated;
revoke all on function public.billing_compute(uuid, uuid, text) from public, anon, authenticated;

-- A dealership's own quote. Takes no dealership ID.
create function public.billing_quote(p_plan_id uuid, p_cycle text)
returns jsonb
language plpgsql
stable
security definer
set search_path = public
as $$
declare
  v_tenant uuid := public.current_tenant_id();
begin
  if v_tenant is null or not public.has_permission('billing.manage') then
    raise exception 'not authorized' using errcode = '42501';
  end if;
  return public.billing_compute(v_tenant, p_plan_id, p_cycle) - 'subscriptionId';
end;
$$;

-- ---------------------------------------------------------------------------
-- Starting a checkout. Server only: which gateway, and whether this is a test, aren't a client's to
-- say. Creates an invoice and a checkout, and changes nothing about the subscription.
-- ---------------------------------------------------------------------------

create function public.billing_issue_invoice(
  p_tenant_id uuid, p_plan_id uuid, p_cycle text, p_quote jsonb, p_is_test boolean, p_actor uuid, p_due timestamptz
)
returns uuid
language plpgsql
security definer
set search_path = public
as $$
declare
  v_profile public.tenant_billing_profiles%rowtype;
  v_entity public.billing_entities%rowtype;
  v_id uuid;
begin
  select * into v_profile from public.tenant_billing_profiles where tenant_id = p_tenant_id;
  select * into v_entity from public.billing_entities where currency = v_profile.currency;

  insert into public.subscription_invoices (
    tenant_id, subscription_id, amount, currency, status, description, kind, subtotal, credit_amount,
    tax_rate, tax_label, tax_amount, plan_id, billing_cycle, billing_snapshot, is_test, created_by, due_at
  )
  values (
    p_tenant_id,
    (p_quote ->> 'subscriptionId')::uuid,
    (p_quote ->> 'total')::numeric,
    p_quote ->> 'currency',
    'issued',
    format('%s plan, %s', p_quote ->> 'planName', p_cycle),
    p_quote ->> 'kind',
    (p_quote ->> 'subtotal')::numeric,
    (p_quote ->> 'credit')::numeric,
    (p_quote ->> 'taxRate')::numeric,
    p_quote ->> 'taxLabel',
    (p_quote ->> 'tax')::numeric,
    p_plan_id,
    p_cycle,
    jsonb_build_object(
      'seller', jsonb_build_object('name', v_entity.legal_name, 'taxId', v_entity.tax_id, 'address', v_entity.address, 'email', v_entity.email),
      'buyer', jsonb_build_object('name', v_profile.legal_name, 'taxId', v_profile.tax_id, 'address', v_profile.address, 'city', v_profile.city, 'country', v_profile.country, 'email', v_profile.email)
    ),
    p_is_test,
    p_actor,
    p_due
  )
  returning id into v_id;
  return v_id;
end;
$$;

revoke all on function public.billing_issue_invoice(uuid, uuid, text, jsonb, boolean, uuid, timestamptz) from public, anon, authenticated;

create function public.billing_prepare_checkout(
  p_tenant_id uuid, p_plan_id uuid, p_cycle text, p_gateway text, p_is_test boolean, p_actor uuid
)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_quote jsonb;
  v_invoice public.subscription_invoices%rowtype;
  v_invoice_id uuid;
  v_id uuid;
  v_row record;
begin
  perform pg_advisory_xact_lock(hashtextextended(p_tenant_id::text || ':checkout', 0));

  v_quote := public.billing_compute(p_tenant_id, p_plan_id, p_cycle);
  if v_quote ? 'error' then
    return v_quote;
  end if;

  -- Only the newest attempt stays open. Its invoice goes too, unless it's a renewal invoice, which
  -- stays payable. A payment on one of these later is kept and flagged, never lost: see apply below.
  for v_row in
    select c.id, c.invoice_id, i.kind as invoice_kind
    from public.billing_checkouts c
    join public.subscription_invoices i on i.id = c.invoice_id
    where c.tenant_id = p_tenant_id and c.status = 'open'
    for update of c
  loop
    update public.billing_checkouts set status = 'superseded' where id = v_row.id;
    if v_row.invoice_kind <> 'renewal' then
      update public.subscription_invoices set status = 'void' where id = v_row.invoice_id and status = 'issued';
    end if;
  end loop;

  if v_quote ->> 'kind' = 'renewal' then
    select * into v_invoice from public.subscription_invoices
    where tenant_id = p_tenant_id and kind = 'renewal' and status = 'issued'
      and subscription_id = (v_quote ->> 'subscriptionId')::uuid
      and plan_id = p_plan_id and billing_cycle = p_cycle and is_test = p_is_test
    order by created_at desc limit 1;
    v_invoice_id := v_invoice.id;
  end if;

  if v_invoice_id is null then
    v_invoice_id := public.billing_issue_invoice(p_tenant_id, p_plan_id, p_cycle, v_quote, p_is_test, p_actor, null);
    select * into v_invoice from public.subscription_invoices where id = v_invoice_id;
  end if;

  insert into public.billing_checkouts (tenant_id, invoice_id, kind, plan_id, billing_cycle, gateway, is_test, created_by)
  values (p_tenant_id, v_invoice_id, v_invoice.kind, p_plan_id, p_cycle, p_gateway, p_is_test, p_actor)
  returning id into v_id;

  return jsonb_build_object(
    'checkoutId', v_id,
    'invoiceId', v_invoice_id,
    'invoiceNumber', v_invoice.invoice_number,
    'description', v_invoice.description,
    'amount', v_invoice.amount,
    'currency', v_invoice.currency,
    'kind', v_invoice.kind
  );
end;
$$;

-- Paying a renewal invoice already issued: exactly what it says, for the plan it says, including a
-- scheduled move down. The dealership is the caller's own, checked on the server first.
create function public.billing_pay_invoice(
  p_tenant_id uuid, p_invoice_id uuid, p_gateway text, p_is_test boolean, p_actor uuid
)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_invoice public.subscription_invoices%rowtype;
  v_id uuid;
begin
  perform pg_advisory_xact_lock(hashtextextended(p_tenant_id::text || ':checkout', 0));
  select * into v_invoice from public.subscription_invoices
  where id = p_invoice_id and tenant_id = p_tenant_id and status = 'issued' and kind = 'renewal' and is_test = p_is_test;
  if not found then
    return jsonb_build_object('error', 'invoice_not_payable');
  end if;

  update public.billing_checkouts set status = 'superseded' where tenant_id = p_tenant_id and status = 'open';

  insert into public.billing_checkouts (tenant_id, invoice_id, kind, plan_id, billing_cycle, gateway, is_test, created_by)
  values (p_tenant_id, v_invoice.id, 'renewal', v_invoice.plan_id, v_invoice.billing_cycle, p_gateway, p_is_test, p_actor)
  returning id into v_id;

  return jsonb_build_object(
    'checkoutId', v_id,
    'invoiceId', v_invoice.id,
    'invoiceNumber', v_invoice.invoice_number,
    'description', v_invoice.description,
    'amount', v_invoice.amount,
    'currency', v_invoice.currency,
    'kind', 'renewal'
  );
end;
$$;

create function public.billing_attach_session(p_checkout_id uuid, p_session_id text)
returns void
language sql
security definer
set search_path = public
as $$
  update public.billing_checkouts set provider_session_id = p_session_id where id = p_checkout_id and status = 'open';
$$;

-- ---------------------------------------------------------------------------
-- A verified payment. Everything here commits together, or not at all.
-- ---------------------------------------------------------------------------

create function public.billing_activate(p_checkout public.billing_checkouts, p_invoice public.subscription_invoices)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  v_sub public.tenant_subscriptions%rowtype;
  v_new uuid;
  v_length interval := case p_checkout.billing_cycle when 'yearly' then interval '1 year' else interval '1 month' end;
begin
  select * into v_sub from public.tenant_subscriptions
  where tenant_id = p_checkout.tenant_id
  order by created_at desc, id limit 1
  for update;

  -- A renewal of what's already there runs on from where it ends, so paying early loses nothing.
  if p_checkout.kind = 'renewal' and v_sub.id is not null and v_sub.status <> 'cancelled'
     and v_sub.plan_id = p_checkout.plan_id and v_sub.billing_cycle = p_checkout.billing_cycle then
    update public.tenant_subscriptions
    set status = 'active',
        current_period_end = greatest(coalesce(current_period_end, now()), now()) + v_length,
        expiry_notice_days = null,
        cancel_at_period_end = false,
        scheduled_plan_id = null,
        scheduled_cycle = null,
        ended_at = null,
        amount = p_invoice.subtotal,
        currency = p_invoice.currency
    where id = v_sub.id;
    update public.subscription_invoices set subscription_id = v_sub.id where id = p_invoice.id;
    return;
  end if;

  -- A scheduled downgrade starts when the paid period ends, and an upgrade starts now.
  update public.tenant_subscriptions
  set status = 'cancelled', ended_at = now()
  where tenant_id = p_checkout.tenant_id and status in ('trialing', 'active', 'past_due');

  insert into public.tenant_subscriptions (
    tenant_id, plan_id, status, billing_cycle, current_period_end, amount, currency, is_test, created_by
  )
  values (
    p_checkout.tenant_id, p_checkout.plan_id, 'active', p_checkout.billing_cycle,
    case
      when p_checkout.kind = 'renewal' then greatest(coalesce(v_sub.current_period_end, now()), now()) + v_length
      else now() + v_length
    end,
    p_invoice.subtotal, p_invoice.currency, p_checkout.is_test, p_checkout.created_by
  )
  returning id into v_new;
  -- What a later upgrade's credit is worked out from.
  update public.subscription_invoices set subscription_id = v_new where id = p_invoice.id;
end;
$$;

revoke all on function public.billing_activate(public.billing_checkouts, public.subscription_invoices) from public, anon, authenticated;

create function public.billing_apply_payment(
  p_gateway text,
  p_checkout_id uuid,
  p_session_id text,
  p_payment_reference text,
  p_amount_minor bigint,
  p_currency text,
  p_is_test boolean,
  p_occurred_at timestamptz default null
)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_checkout public.billing_checkouts%rowtype;
  v_invoice public.subscription_invoices%rowtype;
  v_inserted uuid;
  v_review text;
  v_plan text;
begin
  select * into v_checkout from public.billing_checkouts
  where id = p_checkout_id and gateway = p_gateway
  for update;
  if not found then
    return jsonb_build_object('result', 'unknown_checkout');
  end if;
  if v_checkout.provider_session_id is not null and v_checkout.provider_session_id <> p_session_id then
    return jsonb_build_object('result', 'session_mismatch');
  end if;

  select * into v_invoice from public.subscription_invoices where id = v_checkout.invoice_id for update;

  if p_is_test <> v_checkout.is_test then
    v_review := 'mode_mismatch';
  elsif upper(p_currency) <> v_invoice.currency then
    v_review := 'currency_mismatch';
  elsif p_amount_minor <> round(v_invoice.amount * 100) then
    v_review := 'amount_mismatch';
  elsif v_checkout.status in ('superseded', 'expired') or v_invoice.status = 'void' then
    v_review := 'late_payment';
  end if;

  -- Money was taken either way, so it's always recorded. What it doesn't always do is change a plan.
  -- The amount is what the gateway reported, not what was owed.
  insert into public.subscription_transactions (
    tenant_id, invoice_id, amount, currency, method, reference, kind, status, gateway, provider_reference, is_test, occurred_at
  )
  values (
    v_checkout.tenant_id, v_invoice.id, p_amount_minor / 100.0, upper(p_currency), p_gateway, p_payment_reference,
    'payment', 'succeeded', p_gateway, p_payment_reference, p_is_test, coalesce(p_occurred_at, now())
  )
  on conflict (gateway, kind, status, provider_reference) where provider_reference is not null do nothing
  returning id into v_inserted;

  if v_inserted is null then
    return jsonb_build_object('result', 'duplicate', 'status', v_checkout.status);
  end if;

  if v_review is not null then
    update public.billing_checkouts set status = 'needs_review', review_reason = v_review where id = v_checkout.id;
    perform public.platform_log('billing.payment_needs_review', 'billing_checkouts', v_checkout.id, v_checkout.tenant_id,
      null, null, jsonb_build_object('reason', v_review, 'reference', p_payment_reference));
    return jsonb_build_object('result', 'needs_review', 'reason', v_review);
  end if;

  update public.subscription_invoices set status = 'paid', paid_at = now() where id = v_invoice.id;
  update public.billing_checkouts set status = 'paid', provider_session_id = coalesce(provider_session_id, p_session_id) where id = v_checkout.id;
  perform public.billing_activate(v_checkout, v_invoice);

  select name into v_plan from public.plans where id = v_checkout.plan_id;
  perform public.notify_tenant_admins(
    v_checkout.tenant_id, 'subscription_payment_received', 'Payment received',
    format('We received your payment for %s. Invoice %s.', v_plan, v_invoice.invoice_number),
    jsonb_build_object('plan', v_plan, 'invoiceNumber', v_invoice.invoice_number)
  );
  insert into public.billing_email_outbox (tenant_id, kind, invoice_id, data)
  values (v_checkout.tenant_id, 'payment_confirmation', v_invoice.id, jsonb_build_object('plan', v_plan, 'invoiceNumber', v_invoice.invoice_number));

  return jsonb_build_object('result', 'applied');
end;
$$;

-- A failed attempt. Nothing about the subscription changes: its period, past-due and grace days
-- carry on as they would, and the dealership can simply try again.
create function public.billing_record_failure(
  p_gateway text, p_checkout_id uuid, p_payment_reference text, p_amount_minor bigint, p_currency text,
  p_reason text, p_is_test boolean
)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_checkout public.billing_checkouts%rowtype;
  v_invoice public.subscription_invoices%rowtype;
  v_inserted uuid;
begin
  select * into v_checkout from public.billing_checkouts where id = p_checkout_id and gateway = p_gateway for update;
  if not found then
    return jsonb_build_object('result', 'unknown_checkout');
  end if;
  select * into v_invoice from public.subscription_invoices where id = v_checkout.invoice_id;

  insert into public.subscription_transactions (
    tenant_id, invoice_id, amount, currency, method, reference, kind, status, gateway, provider_reference,
    failure_reason, is_test
  )
  values (
    v_checkout.tenant_id, v_invoice.id, greatest(coalesce(p_amount_minor, round(v_invoice.amount * 100)), 1) / 100.0,
    upper(coalesce(p_currency, v_invoice.currency)), p_gateway, p_payment_reference, 'payment', 'failed', p_gateway,
    p_payment_reference, left(p_reason, 200), p_is_test
  )
  on conflict (gateway, kind, status, provider_reference) where provider_reference is not null do nothing
  returning id into v_inserted;
  if v_inserted is null then
    return jsonb_build_object('result', 'duplicate');
  end if;

  if v_checkout.status = 'open' then
    update public.billing_checkouts set status = 'failed' where id = v_checkout.id;
  end if;
  perform public.notify_tenant_admins(
    v_checkout.tenant_id, 'subscription_payment_failed', 'Payment failed',
    format('Your payment for invoice %s didn''t go through. You can try again from Billing.', v_invoice.invoice_number),
    jsonb_build_object('invoiceNumber', v_invoice.invoice_number)
  );
  insert into public.billing_email_outbox (tenant_id, kind, invoice_id, data)
  values (v_checkout.tenant_id, 'payment_failed', v_invoice.id, jsonb_build_object('invoiceNumber', v_invoice.invoice_number));
  return jsonb_build_object('result', 'recorded');
end;
$$;

create function public.billing_expire_checkout(p_gateway text, p_checkout_id uuid)
returns void
language sql
security definer
set search_path = public
as $$
  update public.billing_checkouts set status = 'expired'
  where id = p_checkout_id and gateway = p_gateway and status in ('open', 'failed');
$$;

-- ---------------------------------------------------------------------------
-- Refunds. Starting one records it as pending first, so a crash after the gateway call leaves a trace
-- rather than money gone with nothing to show for it.
-- ---------------------------------------------------------------------------

create function public.platform_prepare_refund(p_transaction_id uuid, p_amount numeric, p_reason text default null)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_tx public.subscription_transactions%rowtype;
  v_refunded numeric;
  v_id uuid;
begin
  if not public.has_platform_permission('billing.manage') then
    raise exception 'not authorized' using errcode = '42501';
  end if;
  select * into v_tx from public.subscription_transactions where id = p_transaction_id for update;
  if not found or v_tx.kind <> 'payment' or v_tx.status <> 'succeeded' or v_tx.amount <= 0 then
    raise exception 'that payment can''t be refunded' using errcode = '22023';
  end if;
  if p_amount is null or p_amount <= 0 then
    raise exception 'invalid refund amount' using errcode = '22023';
  end if;
  -- Pending ones count: two at once can't both refund the same money.
  select coalesce(sum(-amount), 0) into v_refunded from public.subscription_transactions
  where parent_transaction_id = v_tx.id and kind = 'refund' and status in ('succeeded', 'pending');
  if p_amount > v_tx.amount - v_refunded then
    raise exception 'that''s more than is left to refund' using errcode = '22023';
  end if;

  insert into public.subscription_transactions (
    tenant_id, invoice_id, amount, currency, method, kind, status, gateway, parent_transaction_id, notes, is_test, recorded_by
  )
  values (
    v_tx.tenant_id, v_tx.invoice_id, -p_amount, v_tx.currency, v_tx.method, 'refund', 'pending', v_tx.gateway,
    v_tx.id, p_reason, v_tx.is_test, auth.uid()
  )
  returning id into v_id;

  return jsonb_build_object(
    'refundId', v_id, 'gateway', v_tx.gateway, 'paymentReference', v_tx.provider_reference,
    'amount', p_amount, 'currency', v_tx.currency, 'isTest', v_tx.is_test
  );
end;
$$;

create function public.billing_finish_refund(p_refund_id uuid, p_succeeded boolean, p_reference text, p_reason text default null)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  v_tx public.subscription_transactions%rowtype;
  v_number text;
begin
  select * into v_tx from public.subscription_transactions where id = p_refund_id and kind = 'refund' for update;
  if not found or v_tx.status <> 'pending' then
    return;
  end if;
  update public.subscription_transactions
  set status = case when p_succeeded then 'succeeded' else 'failed' end,
      provider_reference = p_reference,
      reference = p_reference,
      failure_reason = case when p_succeeded then null else left(p_reason, 200) end
  where id = p_refund_id;
  if p_succeeded then
    select invoice_number into v_number from public.subscription_invoices where id = v_tx.invoice_id;
    perform public.notify_tenant_admins(
      v_tx.tenant_id, 'subscription_refund_issued', 'Refund issued',
      format('A refund was issued against invoice %s.', v_number),
      jsonb_build_object('invoiceNumber', v_number)
    );
    insert into public.billing_email_outbox (tenant_id, kind, invoice_id, data)
    values (v_tx.tenant_id, 'refund_issued', v_tx.invoice_id, jsonb_build_object('invoiceNumber', v_number, 'amount', -v_tx.amount, 'currency', v_tx.currency));
  end if;
end;
$$;

-- A refund made in the gateway's own dashboard reaches us here. One we started is already recorded.
create function public.billing_record_external_refund(
  p_gateway text, p_payment_reference text, p_refund_reference text, p_amount_minor bigint, p_is_test boolean
)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_tx public.subscription_transactions%rowtype;
begin
  select * into v_tx from public.subscription_transactions
  where gateway = p_gateway and kind = 'payment' and status = 'succeeded' and provider_reference = p_payment_reference
  for update;
  if not found then
    return jsonb_build_object('result', 'unknown_payment');
  end if;
  if exists (
    select 1 from public.subscription_transactions
    where gateway = p_gateway and kind = 'refund' and provider_reference = p_refund_reference
  ) then
    return jsonb_build_object('result', 'duplicate');
  end if;
  insert into public.subscription_transactions (
    tenant_id, invoice_id, amount, currency, method, reference, kind, status, gateway, provider_reference,
    parent_transaction_id, is_test, notes
  )
  values (
    v_tx.tenant_id, v_tx.invoice_id, -(p_amount_minor / 100.0), v_tx.currency, v_tx.method, p_refund_reference,
    'refund', 'succeeded', p_gateway, p_refund_reference, v_tx.id, p_is_test, 'Made at the gateway'
  );
  return jsonb_build_object('result', 'recorded');
end;
$$;

-- ---------------------------------------------------------------------------
-- What a dealership can do to its own subscription without paying. Take no dealership ID.
-- ---------------------------------------------------------------------------

create function public.billing_set_cancel_at_period_end(p_cancel boolean)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  v_tenant uuid := public.current_tenant_id();
begin
  if v_tenant is null or not public.has_permission('billing.manage') then
    raise exception 'not authorized' using errcode = '42501';
  end if;
  update public.tenant_subscriptions
  set cancel_at_period_end = p_cancel,
      scheduled_plan_id = case when p_cancel then null else scheduled_plan_id end,
      scheduled_cycle = case when p_cancel then null else scheduled_cycle end
  where tenant_id = v_tenant and status in ('trialing', 'active', 'past_due') and current_period_end is not null;
  if not found then
    raise exception 'nothing to cancel' using errcode = 'P0002';
  end if;
end;
$$;

-- A move down starts when what's been paid for ends. Null clears it. It's also what the next renewal
-- invoice is priced at, and nothing changes until that's paid.
create function public.billing_schedule_change(p_plan_id uuid, p_cycle text)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  v_tenant uuid := public.current_tenant_id();
begin
  if v_tenant is null or not public.has_permission('billing.manage') then
    raise exception 'not authorized' using errcode = '42501';
  end if;
  if p_plan_id is not null and not exists (select 1 from public.plans where id = p_plan_id and is_active) then
    raise exception 'plan not found' using errcode = 'P0002';
  end if;
  if p_plan_id is not null and p_cycle not in ('monthly', 'yearly') then
    raise exception 'invalid cycle' using errcode = '22023';
  end if;
  update public.tenant_subscriptions
  set scheduled_plan_id = p_plan_id,
      scheduled_cycle = case when p_plan_id is null then null else p_cycle end,
      cancel_at_period_end = false
  where tenant_id = v_tenant and status in ('active', 'past_due') and current_period_end is not null;
  if not found then
    raise exception 'nothing to change' using errcode = 'P0002';
  end if;
end;
$$;

-- ---------------------------------------------------------------------------
-- Renewal invoices, a week ahead. Custom terms and no-expiry subscriptions, like Zohaan's, get none.
-- No card is stored, so nobody is charged by this: it issues an invoice and asks.
-- ---------------------------------------------------------------------------

create function public.billing_generate_renewal_invoices(p_is_test boolean default false)
returns integer
language plpgsql
security definer
set search_path = public
as $$
declare
  v_row record;
  v_plan uuid;
  v_cycle text;
  v_quote jsonb;
  v_id uuid;
  v_count integer := 0;
begin
  for v_row in
    select s.* from public.tenant_subscriptions s
    where s.status in ('active', 'past_due')
      and s.billing_cycle in ('monthly', 'yearly')
      and s.current_period_end is not null
      and s.current_period_end <= now() + interval '7 days'
      and not s.cancel_at_period_end
      and s.is_test = p_is_test
    for update of s skip locked
  loop
    v_plan := coalesce(v_row.scheduled_plan_id, v_row.plan_id);
    v_cycle := coalesce(v_row.scheduled_cycle, v_row.billing_cycle);

    if exists (
      select 1 from public.subscription_invoices i
      where i.subscription_id = v_row.id and i.kind = 'renewal' and i.status in ('issued', 'paid')
        and i.created_at >= v_row.current_period_end - interval '30 days'
    ) then
      continue;
    end if;

    -- A plain renewal price, whichever plan it's for: no credit and no upgrade rules, because nothing
    -- is owed until the paid period ends.
    v_quote := public.billing_compute_renewal(v_row.tenant_id, v_plan, v_cycle, v_row.id);
    if v_quote ? 'error' then
      continue;
    end if;
    v_quote := v_quote || jsonb_build_object('kind', 'renewal');

    v_id := public.billing_issue_invoice(v_row.tenant_id, v_plan, v_cycle, v_quote, p_is_test, null, v_row.current_period_end);
    insert into public.billing_email_outbox (tenant_id, kind, invoice_id, data)
    values (v_row.tenant_id, 'invoice_issued', v_id, jsonb_build_object('due', v_row.current_period_end));
    v_count := v_count + 1;
  end loop;
  return v_count;
end;
$$;

-- A plain renewal price, with no credit and no upgrade rules.
create function public.billing_compute_renewal(p_tenant_id uuid, p_plan_id uuid, p_cycle text, p_subscription_id uuid)
returns jsonb
language plpgsql
stable
security definer
set search_path = public
as $$
declare
  v_profile public.tenant_billing_profiles%rowtype;
  v_tax public.billing_tax_rates%rowtype;
  v_price numeric;
  v_plan text;
  v_tax_amount numeric;
begin
  select * into v_profile from public.tenant_billing_profiles where tenant_id = p_tenant_id;
  v_price := public.plan_price(p_plan_id, v_profile.currency, p_cycle);
  select * into v_tax from public.billing_tax_rates where country = v_profile.country;
  select name into v_plan from public.plans where id = p_plan_id;
  if v_price is null or v_tax.country is null
     or not exists (select 1 from public.billing_entities where currency = v_profile.currency) then
    return jsonb_build_object('error', 'not_priced');
  end if;
  v_tax_amount := round(v_price * v_tax.rate / 100, 2);
  return jsonb_build_object(
    'planName', v_plan, 'currency', v_profile.currency, 'subtotal', v_price, 'credit', 0,
    'taxLabel', v_tax.label, 'taxRate', v_tax.rate, 'tax', v_tax_amount, 'total', v_price + v_tax_amount,
    'subscriptionId', p_subscription_id
  );
end;
$$;

-- ---------------------------------------------------------------------------
-- Reports. Money in test mode never counts, and no currency is added to another.
-- ---------------------------------------------------------------------------

create function public.platform_billing_report(p_months integer default 12)
returns table (month date, currency text, received numeric, refunded numeric, tax numeric, failed bigint, payments bigint)
language plpgsql
stable
security definer
set search_path = public
as $$
begin
  if not public.has_platform_permission('billing.view') then
    raise exception 'not authorized' using errcode = '42501';
  end if;
  return query
    select
      date_trunc('month', t.occurred_at)::date,
      t.currency,
      coalesce(sum(t.amount) filter (where t.kind = 'payment' and t.status = 'succeeded'), 0)::numeric,
      coalesce(sum(-t.amount) filter (where t.kind = 'refund' and t.status = 'succeeded'), 0)::numeric,
      coalesce(sum(i.tax_amount) filter (where t.kind = 'payment' and t.status = 'succeeded'), 0)::numeric,
      count(*) filter (where t.status = 'failed'),
      count(*) filter (where t.kind = 'payment' and t.status = 'succeeded')
    from public.subscription_transactions t
    join public.subscription_invoices i on i.id = t.invoice_id
    where not t.is_test
      and t.occurred_at >= date_trunc('month', now()) - make_interval(months => greatest(least(coalesce(p_months, 12), 60), 1) - 1)
    group by 1, 2
    order by 1 desc, 2;
end;
$$;

-- ---------------------------------------------------------------------------
-- Phase 3 functions corrected for rows that aren't money received
-- ---------------------------------------------------------------------------

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
  from public.subscription_transactions where invoice_id = p_invoice_id and status = 'succeeded';

  if v_invoice.status = 'issued' and v_total >= v_invoice.amount then
    update public.subscription_invoices set status = 'paid', paid_at = now() where id = p_invoice_id;
  end if;

  return v_id;
end;
$$;

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
      and not s.cancel_at_period_end
    for update of s skip locked
  loop
    v_days := ceil(extract(epoch from v_row.current_period_end - now()) / 86400)::integer;
    v_notice := case when v_days <= 1 then 1 when v_days <= 7 then 7 else 14 end;
    if v_row.expiry_notice_days is null or v_notice < v_row.expiry_notice_days then
      update public.tenant_subscriptions set expiry_notice_days = v_notice where id = v_row.id;
      insert into public.billing_email_outbox (tenant_id, kind, data)
      values (v_row.tenant_id, 'renewal_reminder', jsonb_build_object('plan', v_row.plan_name, 'periodEnd', v_row.current_period_end, 'days', v_days));
      perform public.notify_tenant_admins(
        v_row.tenant_id, 'subscription_expiring', 'Subscription ending soon',
        format('Your %s subscription ends on %s.', v_row.plan_name, to_char(v_row.current_period_end, 'DD Mon YYYY')),
        jsonb_build_object('plan', v_row.plan_name, 'periodEnd', v_row.current_period_end, 'days', v_days)
      );
      v_notices := v_notices + 1;
    end if;
  end loop;

  -- Asked to stop at the end of the period: no grace, because nothing is owed.
  for v_row in
    select s.id, s.tenant_id, p.name as plan_name
    from public.tenant_subscriptions s
    join public.plans p on p.id = s.plan_id
    where s.status in ('trialing', 'active', 'past_due')
      and s.cancel_at_period_end
      and s.current_period_end <= now()
    for update of s skip locked
  loop
    update public.tenant_subscriptions set status = 'cancelled', ended_at = now() where id = v_row.id;
    perform public.notify_tenant_admins(
      v_row.tenant_id, 'subscription_cancelled', 'Subscription ended',
      format('Your %s subscription has ended, as you asked. Existing records stay available, and new ones are paused.', v_row.plan_name),
      jsonb_build_object('plan', v_row.plan_name)
    );
    insert into public.billing_email_outbox (tenant_id, kind, data)
    values (v_row.tenant_id, 'subscription_ended', jsonb_build_object('plan', v_row.plan_name));
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
    insert into public.billing_email_outbox (tenant_id, kind, data)
    values (v_row.tenant_id, 'subscription_ended', jsonb_build_object('plan', v_row.plan_name));
    v_expired := v_expired + 1;
  end loop;

  return jsonb_build_object('notices', v_notices, 'pastDue', v_past_due, 'expired', v_expired);
end;
$$;

-- ---------------------------------------------------------------------------
-- Server only, except the three a dealership or platform staff call for themselves
-- ---------------------------------------------------------------------------

do $$
declare
  fn text;
begin
  foreach fn in array array[
    'billing_issue_invoice(uuid, uuid, text, jsonb, boolean, uuid, timestamptz)',
    'billing_prepare_checkout(uuid, uuid, text, text, boolean, uuid)',
    'billing_pay_invoice(uuid, uuid, text, boolean, uuid)',
    'billing_attach_session(uuid, text)',
    'billing_apply_payment(text, uuid, text, text, bigint, text, boolean, timestamptz)',
    'billing_record_failure(text, uuid, text, bigint, text, text, boolean)',
    'billing_expire_checkout(text, uuid)',
    'billing_finish_refund(uuid, boolean, text, text)',
    'billing_record_external_refund(text, text, text, bigint, boolean)',
    'billing_generate_renewal_invoices(boolean)',
    'billing_compute_renewal(uuid, uuid, text, uuid)'
  ]
  loop
    execute format('revoke all on function public.%s from public, anon, authenticated', fn);
    execute format('grant execute on function public.%s to service_role', fn);
  end loop;

  foreach fn in array array[
    'billing_quote(uuid, text)',
    'billing_set_cancel_at_period_end(boolean)',
    'billing_schedule_change(uuid, text)',
    'platform_prepare_refund(uuid, numeric, text)',
    'platform_billing_report(integer)'
  ]
  loop
    execute format('revoke all on function public.%s from public, anon', fn);
    execute format('grant execute on function public.%s to authenticated, service_role', fn);
  end loop;
end;
$$;

do $$
declare
  fn record;
begin
  for fn in
    select p.oid::regprocedure as sig, has_function_privilege('authenticated', p.oid, 'execute') as for_staff
    from pg_proc p
    where p.pronamespace = 'public'::regnamespace and p.prokind = 'f'
      and has_function_privilege('anon', p.oid, 'execute')
  loop
    if fn.for_staff then
      execute format('grant execute on function %s to authenticated', fn.sig);
    end if;
    execute format('revoke execute on function %s from public, anon', fn.sig);
  end loop;
end;
$$;
