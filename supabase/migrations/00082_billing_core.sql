-- SaaS Phase 5: what paying through a gateway needs on top of Phase 3's records. Additive: every
-- existing plan, subscription, invoice and payment keeps its meaning. No card details are stored
-- anywhere: only the gateway's own references.
-- Rollback: supabase/rollbacks/00082_billing_core_down.sql

-- ---------------------------------------------------------------------------
-- Who may pay, and what things cost. A plan's own price columns stay the price in its own currency;
-- this table only adds other currencies, so no price is held twice.
-- ---------------------------------------------------------------------------

insert into public.permissions (key, name, module, description)
values ('billing.manage', 'Manage billing', 'billing', 'Buy and change the dealership''s plan, and see its invoices.')
on conflict (key) do nothing;

create table public.plan_prices (
  plan_id uuid not null references public.plans (id) on delete cascade,
  currency text not null,
  billing_cycle text not null,
  amount numeric(12, 2) not null,
  primary key (plan_id, currency, billing_cycle),
  constraint plan_prices_currency_valid check (currency in ('AED', 'INR')),
  constraint plan_prices_cycle_valid check (billing_cycle in ('monthly', 'yearly')),
  constraint plan_prices_amount_positive check (amount > 0)
);

-- Null means this plan can't be bought in this currency. Zero is "not set", never "free".
create function public.plan_price(p_plan_id uuid, p_currency text, p_cycle text)
returns numeric
language sql
stable
security definer
set search_path = public
as $$
  select coalesce(
    (select nullif(case p_cycle when 'monthly' then p.price_monthly when 'yearly' then p.price_yearly end, 0)
     from public.plans p where p.id = p_plan_id and p.currency = p_currency),
    (select pp.amount from public.plan_prices pp
     where pp.plan_id = p_plan_id and pp.currency = p_currency and pp.billing_cycle = p_cycle)
  );
$$;

revoke all on function public.plan_price(uuid, text, text) from public, anon, authenticated;
grant execute on function public.plan_price(uuid, text, text) to service_role;

-- Starting values for an accountant to confirm. A country with no row can't check out, so nobody is
-- undercharged tax by accident.
create table public.billing_tax_rates (
  country text primary key,
  label text not null,
  rate numeric(5, 2) not null,
  updated_at timestamptz not null default timezone('utc', now()),
  constraint billing_tax_rates_country_format check (country ~ '^[A-Z]{2}$'),
  constraint billing_tax_rates_rate_valid check (rate >= 0 and rate <= 100)
);

insert into public.billing_tax_rates (country, label, rate) values ('AE', 'VAT', 5), ('IN', 'GST', 18);

-- AutoNexa's own details for each currency, as printed on invoices. Empty until someone sets them,
-- and checkout refuses until then: a tax invoice with no seller isn't one.
create table public.billing_entities (
  currency text primary key,
  legal_name text not null,
  tax_id text,
  address text,
  email text,
  updated_at timestamptz not null default timezone('utc', now()),
  constraint billing_entities_currency_valid check (currency in ('AED', 'INR')),
  constraint billing_entities_name_not_blank check (length(trim(legal_name)) > 0)
);

-- A dealership's billing details. Its currency decides its gateway and prices.
create table public.tenant_billing_profiles (
  tenant_id uuid primary key references public.tenants (id) on delete restrict,
  legal_name text not null,
  tax_id text,
  address text,
  city text,
  country text not null default 'AE',
  currency text not null default 'AED',
  email text,
  updated_by uuid,
  updated_at timestamptz not null default timezone('utc', now()),
  constraint tenant_billing_profiles_name_not_blank check (length(trim(legal_name)) > 0),
  constraint tenant_billing_profiles_country_format check (country ~ '^[A-Z]{2}$'),
  constraint tenant_billing_profiles_currency_valid check (currency in ('AED', 'INR'))
);

-- ---------------------------------------------------------------------------
-- Phase 3's tables gain what a real payment carries
-- ---------------------------------------------------------------------------

alter table public.tenant_subscriptions
  add column cancel_at_period_end boolean not null default false,
  add column scheduled_plan_id uuid references public.plans (id) on delete set null,
  add column scheduled_cycle text,
  add column amount numeric(12, 2),
  add column currency text,
  add column is_test boolean not null default false,
  add constraint tenant_subscriptions_scheduled_cycle_valid
    check (scheduled_cycle is null or scheduled_cycle in ('monthly', 'yearly'));

alter table public.subscription_invoices
  add column kind text not null default 'manual',
  add column subtotal numeric(12, 2),
  add column credit_amount numeric(12, 2) not null default 0,
  add column tax_rate numeric(5, 2),
  add column tax_label text,
  add column tax_amount numeric(12, 2),
  add column plan_id uuid references public.plans (id) on delete set null,
  add column billing_cycle text,
  -- Seller and buyer as they were when issued. Changing an address later can't rewrite an invoice.
  add column billing_snapshot jsonb,
  add column is_test boolean not null default false,
  add constraint subscription_invoices_kind_valid check (kind in ('manual', 'new', 'upgrade', 'renewal'));

alter table public.subscription_transactions
  drop constraint subscription_transactions_method_valid,
  add column kind text not null default 'payment',
  add column status text not null default 'succeeded',
  add column gateway text,
  add column provider_reference text,
  add column failure_reason text,
  add column parent_transaction_id uuid references public.subscription_transactions (id) on delete set null,
  add column is_test boolean not null default false,
  add constraint subscription_transactions_method_valid
    check (method in ('manual', 'bank_transfer', 'cash', 'card', 'cheque', 'other', 'stripe', 'razorpay')),
  add constraint subscription_transactions_kind_valid check (kind in ('payment', 'refund')),
  add constraint subscription_transactions_status_valid check (status in ('succeeded', 'pending', 'failed')),
  add constraint subscription_transactions_gateway_valid check (gateway is null or gateway in ('stripe', 'razorpay'));

-- The same gateway event can never become two records of money.
create unique index subscription_transactions_provider_unique
  on public.subscription_transactions (gateway, kind, status, provider_reference)
  where provider_reference is not null;

-- ---------------------------------------------------------------------------
-- A checkout is an intention. It has no effect on a plan until a verified payment arrives.
-- ---------------------------------------------------------------------------

create table public.billing_checkouts (
  id uuid primary key default gen_random_uuid(),
  tenant_id uuid not null references public.tenants (id) on delete restrict,
  invoice_id uuid not null,
  kind text not null,
  plan_id uuid not null references public.plans (id) on delete restrict,
  billing_cycle text not null,
  gateway text not null,
  is_test boolean not null default false,
  provider_session_id text,
  status text not null default 'open',
  review_reason text,
  created_by uuid,
  created_at timestamptz not null default timezone('utc', now()),
  updated_at timestamptz not null default timezone('utc', now()),
  constraint billing_checkouts_kind_valid check (kind in ('new', 'upgrade', 'renewal')),
  constraint billing_checkouts_cycle_valid check (billing_cycle in ('monthly', 'yearly')),
  constraint billing_checkouts_gateway_valid check (gateway in ('stripe', 'razorpay')),
  constraint billing_checkouts_status_valid
    check (status in ('open', 'paid', 'failed', 'expired', 'superseded', 'needs_review')),
  constraint billing_checkouts_invoice_fkey foreign key (tenant_id, invoice_id)
    references public.subscription_invoices (tenant_id, id) on delete restrict
);

create unique index billing_checkouts_session_unique on public.billing_checkouts (gateway, provider_session_id)
  where provider_session_id is not null;
create index billing_checkouts_tenant_idx on public.billing_checkouts (tenant_id, created_at desc);

create trigger billing_checkouts_set_updated_at before update on public.billing_checkouts
for each row execute function public.set_updated_at();

-- Seen events, so a redelivered webhook does nothing twice. Holds no payload, and so no customer data.
create table public.billing_webhook_events (
  gateway text not null,
  event_id text not null,
  event_type text not null,
  status text not null default 'received',
  is_test boolean not null default false,
  error text,
  attempts integer not null default 1,
  received_at timestamptz not null default timezone('utc', now()),
  processed_at timestamptz,
  primary key (gateway, event_id),
  constraint billing_webhook_events_status_valid check (status in ('received', 'processed', 'failed', 'ignored'))
);

create index billing_webhook_events_received_idx on public.billing_webhook_events (received_at desc);

-- Emails are written in the same transaction as what caused them, then sent. So a payment can't
-- commit without its email being queued, and a retry can't send one twice.
create table public.billing_email_outbox (
  id uuid primary key default gen_random_uuid(),
  tenant_id uuid not null references public.tenants (id) on delete restrict,
  kind text not null,
  invoice_id uuid,
  data jsonb not null default '{}'::jsonb,
  attempts integer not null default 0,
  sent_at timestamptz,
  created_at timestamptz not null default timezone('utc', now()),
  constraint billing_email_outbox_kind_valid check (
    kind in ('payment_confirmation', 'invoice_issued', 'renewal_reminder', 'payment_failed', 'refund_issued', 'subscription_ended')
  )
);

create index billing_email_outbox_unsent_idx on public.billing_email_outbox (created_at) where sent_at is null;

-- ---------------------------------------------------------------------------
-- Access
-- ---------------------------------------------------------------------------

alter table public.plan_prices enable row level security;
alter table public.billing_tax_rates enable row level security;
alter table public.billing_entities enable row level security;
alter table public.tenant_billing_profiles enable row level security;
alter table public.billing_checkouts enable row level security;
alter table public.billing_webhook_events enable row level security;
alter table public.billing_email_outbox enable row level security;

revoke all on public.plan_prices, public.billing_tax_rates, public.billing_entities,
  public.tenant_billing_profiles, public.billing_checkouts, public.billing_webhook_events,
  public.billing_email_outbox from anon, authenticated;
grant all on public.plan_prices, public.billing_tax_rates, public.billing_entities,
  public.tenant_billing_profiles, public.billing_checkouts, public.billing_webhook_events,
  public.billing_email_outbox to service_role;

grant select, insert, update, delete on public.plan_prices to authenticated;
grant select, insert, update on public.billing_tax_rates, public.billing_entities to authenticated;
grant select on public.billing_checkouts, public.billing_webhook_events to authenticated;
grant select on public.tenant_billing_profiles to authenticated;
grant insert (tenant_id, legal_name, tax_id, address, city, country, currency, email, updated_by),
  update (legal_name, tax_id, address, city, country, currency, email, updated_by)
  on public.tenant_billing_profiles to authenticated;

create policy plan_prices_select on public.plan_prices for select to authenticated
  using ((select public.has_platform_permission('plans.view')));
create policy plan_prices_write on public.plan_prices for all to authenticated
  using ((select public.has_platform_permission('plans.manage')))
  with check ((select public.has_platform_permission('plans.manage')));

create policy billing_tax_rates_select on public.billing_tax_rates for select to authenticated
  using ((select public.has_platform_permission('billing.view')));
create policy billing_tax_rates_write on public.billing_tax_rates for all to authenticated
  using ((select public.has_platform_permission('billing.manage')))
  with check ((select public.has_platform_permission('billing.manage')));

create policy billing_entities_select on public.billing_entities for select to authenticated
  using ((select public.has_platform_permission('billing.view')));
create policy billing_entities_write on public.billing_entities for all to authenticated
  using ((select public.has_platform_permission('billing.manage')))
  with check ((select public.has_platform_permission('billing.manage')));

create policy tenant_billing_profiles_select on public.tenant_billing_profiles for select to authenticated
  using (
    (select public.has_platform_permission('billing.view'))
    or (tenant_id = (select public.current_tenant_id()) and (select public.has_permission('billing.manage')))
  );
create policy tenant_billing_profiles_insert on public.tenant_billing_profiles for insert to authenticated
  with check (tenant_id = (select public.current_tenant_id()) and (select public.has_permission('billing.manage')));
create policy tenant_billing_profiles_update on public.tenant_billing_profiles for update to authenticated
  using (tenant_id = (select public.current_tenant_id()) and (select public.has_permission('billing.manage')))
  with check (tenant_id = (select public.current_tenant_id()) and (select public.has_permission('billing.manage')));

create policy billing_checkouts_select on public.billing_checkouts for select to authenticated
  using (
    (select public.has_platform_permission('billing.view'))
    or (tenant_id = (select public.current_tenant_id()) and (select public.has_permission('billing.manage')))
  );

create policy billing_webhook_events_select on public.billing_webhook_events for select to authenticated
  using ((select public.has_platform_permission('billing.view')));

-- Dealerships see their own invoices and payments with either permission from now on.
drop policy subscription_invoices_select on public.subscription_invoices;
create policy subscription_invoices_select on public.subscription_invoices for select to authenticated
  using (
    (select public.has_platform_permission('billing.view'))
    or (
      tenant_id = (select public.current_tenant_id())
      and status <> 'draft'
      and ((select public.has_permission('settings.manage')) or (select public.has_permission('billing.manage')))
    )
  );
drop policy subscription_transactions_select on public.subscription_transactions;
create policy subscription_transactions_select on public.subscription_transactions for select to authenticated
  using (
    (select public.has_platform_permission('billing.view'))
    or (
      tenant_id = (select public.current_tenant_id())
      and ((select public.has_permission('settings.manage')) or (select public.has_permission('billing.manage')))
    )
  );

create trigger platform_audit_row after insert or update or delete on public.plan_prices
  for each row execute function public.platform_audit_row();
create trigger platform_audit_row after insert or update or delete on public.billing_tax_rates
  for each row execute function public.platform_audit_row();
create trigger platform_audit_row after insert or update or delete on public.billing_entities
  for each row execute function public.platform_audit_row();
create trigger platform_audit_row after insert or update on public.tenant_billing_profiles
  for each row execute function public.platform_audit_row();
create trigger platform_audit_row after insert or update on public.billing_checkouts
  for each row execute function public.platform_audit_row();

-- An invoice from a checkout is fixed once issued. Only a manual one may still be corrected.
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
  if old.kind <> 'manual' and (
    new.amount is distinct from old.amount
    or new.subtotal is distinct from old.subtotal
    or new.tax_amount is distinct from old.tax_amount
    or new.credit_amount is distinct from old.credit_amount
    or new.billing_snapshot is distinct from old.billing_snapshot
    or new.kind is distinct from old.kind
  ) then
    raise exception 'a checkout invoice cannot be changed' using errcode = '23514';
  end if;
  return new;
end;
$$;
