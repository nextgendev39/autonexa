-- Reverses 00082. Discards checkouts, webhook history, queued emails, billing details and extra
-- prices. Refuses while invoices or payments from a gateway exist, since those are real money: dropping
-- their columns would destroy the record of them. Export and deal with them first.

do $$
begin
  if exists (select 1 from public.subscription_transactions where gateway is not null or status <> 'succeeded' or kind <> 'payment')
     or exists (select 1 from public.subscription_invoices where kind <> 'manual') then
    raise exception 'gateway billing records exist: refusing to discard them';
  end if;
end;
$$;

create or replace function public.subscription_invoices_guard()
returns trigger
language plpgsql
as $$
begin
  if old.status in ('paid', 'void') and (
    new.amount is distinct from old.amount
    or new.currency is distinct from old.currency
    or new.status is distinct from old.status
  ) then
    raise exception 'a % invoice cannot be changed', old.status using errcode = '23514';
  end if;
  if new.tenant_id is distinct from old.tenant_id then
    raise exception 'an invoice cannot move to another dealership' using errcode = '23514';
  end if;
  return new;
end;
$$;

drop policy subscription_transactions_select on public.subscription_transactions;
create policy subscription_transactions_select on public.subscription_transactions for select to authenticated
  using (
    (select public.has_platform_permission('billing.view'))
    or (tenant_id = (select public.current_tenant_id()) and (select public.has_permission('settings.manage')))
  );
drop policy subscription_invoices_select on public.subscription_invoices;
create policy subscription_invoices_select on public.subscription_invoices for select to authenticated
  using (
    (select public.has_platform_permission('billing.view'))
    or (
      tenant_id = (select public.current_tenant_id())
      and status <> 'draft'
      and (select public.has_permission('settings.manage'))
    )
  );

drop table public.billing_email_outbox;
drop table public.billing_webhook_events;
drop table public.billing_checkouts;

drop index public.subscription_transactions_provider_unique;
alter table public.subscription_transactions
  drop constraint subscription_transactions_gateway_valid,
  drop constraint subscription_transactions_status_valid,
  drop constraint subscription_transactions_kind_valid,
  drop constraint subscription_transactions_method_valid,
  drop column is_test,
  drop column parent_transaction_id,
  drop column failure_reason,
  drop column provider_reference,
  drop column gateway,
  drop column status,
  drop column kind,
  add constraint subscription_transactions_method_valid
    check (method in ('manual', 'bank_transfer', 'cash', 'card', 'cheque', 'other'));

alter table public.subscription_invoices
  drop constraint subscription_invoices_kind_valid,
  drop column is_test,
  drop column billing_snapshot,
  drop column billing_cycle,
  drop column plan_id,
  drop column tax_amount,
  drop column tax_label,
  drop column tax_rate,
  drop column credit_amount,
  drop column subtotal,
  drop column kind;

alter table public.tenant_subscriptions
  drop constraint tenant_subscriptions_scheduled_cycle_valid,
  drop column is_test,
  drop column currency,
  drop column amount,
  drop column scheduled_cycle,
  drop column scheduled_plan_id,
  drop column cancel_at_period_end;

drop table public.tenant_billing_profiles;
drop table public.billing_entities;
drop table public.billing_tax_rates;
drop function public.plan_price(uuid, text, text);
drop table public.plan_prices;

delete from public.role_permissions where permission_id in (select id from public.permissions where key = 'billing.manage');
delete from public.permissions where key = 'billing.manage';
