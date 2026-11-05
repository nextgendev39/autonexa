-- SaaS Phase 3: plans, subscriptions, billing records and dealership settings. Records only: no live
-- payment provider. Zohaan Motors goes on Enterprise with no expiry, so nothing changes for them.
-- Plan prices and limits below are starting values for AutoNexa to set before selling.
-- Rollback: supabase/rollbacks/00078_platform_plans_billing_down.sql

create table public.plans (
  id uuid primary key default gen_random_uuid(),
  key text not null,
  name text not null,
  description text,
  price_monthly numeric(12, 2) not null default 0,
  price_yearly numeric(12, 2) not null default 0,
  currency text not null default 'AED',
  -- Null means unlimited.
  max_users integer,
  max_branches integer,
  max_vehicles integer,
  max_storage_mb integer,
  grace_days integer not null default 7,
  is_active boolean not null default true,
  sort_order integer not null default 0,
  created_at timestamptz not null default timezone('utc', now()),
  updated_at timestamptz not null default timezone('utc', now()),
  constraint plans_key_unique unique (key),
  constraint plans_key_format check (key ~ '^[a-z0-9]+(_[a-z0-9]+)*$'),
  constraint plans_name_not_blank check (length(trim(name)) > 0),
  constraint plans_prices_not_negative check (price_monthly >= 0 and price_yearly >= 0),
  constraint plans_limits_not_negative check (
    coalesce(max_users, 0) >= 0 and coalesce(max_branches, 0) >= 0
    and coalesce(max_vehicles, 0) >= 0 and coalesce(max_storage_mb, 0) >= 0
  ),
  constraint plans_grace_days_valid check (grace_days between 0 and 90)
);

create trigger plans_set_updated_at before update on public.plans
for each row execute function public.set_updated_at();

-- permission_modules names the dealership permissions a feature controls, by their first segment.
create table public.platform_features (
  key text primary key,
  name text not null,
  description text,
  permission_modules text[] not null default '{}',
  sort_order integer not null default 0
);

comment on table public.platform_features is
  'Modules a plan can switch on or off. Adding one needs a plan_features row per plan, or it is off.';

create table public.plan_features (
  plan_id uuid not null references public.plans (id) on delete cascade,
  feature_key text not null references public.platform_features (key) on delete cascade,
  enabled boolean not null default false,
  primary key (plan_id, feature_key)
);

create table public.tenant_subscriptions (
  id uuid primary key default gen_random_uuid(),
  tenant_id uuid not null references public.tenants (id) on delete restrict,
  plan_id uuid not null references public.plans (id) on delete restrict,
  status text not null default 'active',
  billing_cycle text not null default 'monthly',
  started_at timestamptz not null default timezone('utc', now()),
  -- Null means no expiry.
  current_period_end timestamptz,
  ended_at timestamptz,
  -- The smallest days-before-expiry notice already sent, so each one goes out once.
  expiry_notice_days integer,
  created_by uuid,
  created_at timestamptz not null default timezone('utc', now()),
  updated_at timestamptz not null default timezone('utc', now()),
  constraint tenant_subscriptions_tenant_id_id_unique unique (tenant_id, id),
  constraint tenant_subscriptions_status_valid
    check (status in ('trialing', 'active', 'past_due', 'expired', 'cancelled')),
  constraint tenant_subscriptions_cycle_valid check (billing_cycle in ('monthly', 'yearly', 'custom'))
);

create unique index tenant_subscriptions_one_current
  on public.tenant_subscriptions (tenant_id)
  where status in ('trialing', 'active', 'past_due');
create index tenant_subscriptions_tenant_recent_idx
  on public.tenant_subscriptions (tenant_id, created_at desc);
create index tenant_subscriptions_period_end_idx
  on public.tenant_subscriptions (current_period_end)
  where status in ('trialing', 'active', 'past_due');

create trigger tenant_subscriptions_set_updated_at before update on public.tenant_subscriptions
for each row execute function public.set_updated_at();

create sequence public.subscription_invoice_number_seq;

create table public.subscription_invoices (
  id uuid primary key default gen_random_uuid(),
  tenant_id uuid not null references public.tenants (id) on delete restrict,
  subscription_id uuid,
  invoice_number text not null default ('INV-' || lpad(nextval('public.subscription_invoice_number_seq')::text, 6, '0')),
  amount numeric(12, 2) not null,
  currency text not null default 'AED',
  status text not null default 'issued',
  description text,
  period_start date,
  period_end date,
  issued_at timestamptz not null default timezone('utc', now()),
  due_at timestamptz,
  paid_at timestamptz,
  created_by uuid,
  created_at timestamptz not null default timezone('utc', now()),
  updated_at timestamptz not null default timezone('utc', now()),
  constraint subscription_invoices_number_unique unique (invoice_number),
  constraint subscription_invoices_tenant_id_id_unique unique (tenant_id, id),
  constraint subscription_invoices_amount_not_negative check (amount >= 0),
  constraint subscription_invoices_status_valid check (status in ('draft', 'issued', 'paid', 'void')),
  constraint subscription_invoices_subscription_fkey foreign key (tenant_id, subscription_id)
    references public.tenant_subscriptions (tenant_id, id) on delete set null (subscription_id)
);

create index subscription_invoices_tenant_recent_idx
  on public.subscription_invoices (tenant_id, issued_at desc);

create trigger subscription_invoices_set_updated_at before update on public.subscription_invoices
for each row execute function public.set_updated_at();

-- Money already settled cannot be rewritten, only recorded against.
create function public.subscription_invoices_guard()
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

create trigger subscription_invoices_guard before update on public.subscription_invoices
for each row execute function public.subscription_invoices_guard();

-- Append-only: a mistake is corrected with a reversing entry, never an edit.
create table public.subscription_transactions (
  id uuid primary key default gen_random_uuid(),
  tenant_id uuid not null references public.tenants (id) on delete restrict,
  invoice_id uuid not null,
  amount numeric(12, 2) not null,
  currency text not null default 'AED',
  method text not null default 'manual',
  reference text,
  notes text,
  occurred_at timestamptz not null default timezone('utc', now()),
  recorded_by uuid,
  created_at timestamptz not null default timezone('utc', now()),
  constraint subscription_transactions_amount_not_zero check (amount <> 0),
  constraint subscription_transactions_method_valid
    check (method in ('manual', 'bank_transfer', 'cash', 'card', 'cheque', 'other')),
  constraint subscription_transactions_invoice_fkey foreign key (tenant_id, invoice_id)
    references public.subscription_invoices (tenant_id, id) on delete restrict
);

create index subscription_transactions_invoice_idx on public.subscription_transactions (invoice_id);

create table public.tenant_settings (
  tenant_id uuid primary key references public.tenants (id) on delete restrict,
  display_name text,
  logo_url text,
  primary_color text,
  contact_email text,
  contact_phone text,
  address text,
  timezone text not null default 'Asia/Dubai',
  default_locale text not null default 'en',
  currency text not null default 'AED',
  updated_at timestamptz not null default timezone('utc', now()),
  constraint tenant_settings_color_format check (primary_color is null or primary_color ~ '^#[0-9a-fA-F]{6}$'),
  constraint tenant_settings_locale_valid check (default_locale in ('en', 'ar')),
  constraint tenant_settings_logo_https check (logo_url is null or logo_url ~ '^https://')
);

create trigger tenant_settings_set_updated_at before update on public.tenant_settings
for each row execute function public.set_updated_at();

-- Records which domains belong to whom. Serving a dealership from its domain is not built yet.
create table public.tenant_domains (
  id uuid primary key default gen_random_uuid(),
  tenant_id uuid not null references public.tenants (id) on delete restrict,
  domain text not null,
  is_primary boolean not null default false,
  verified_at timestamptz,
  created_at timestamptz not null default timezone('utc', now()),
  constraint tenant_domains_domain_unique unique (domain),
  constraint tenant_domains_domain_format
    check (domain ~ '^([a-z0-9]([a-z0-9-]*[a-z0-9])?\.)+[a-z]{2,}$')
);

create unique index tenant_domains_one_primary on public.tenant_domains (tenant_id) where is_primary;
create index tenant_domains_tenant_idx on public.tenant_domains (tenant_id);

-- ---------------------------------------------------------------------------
-- Access. Platform staff by permission. A dealership reads only what concerns itself, and none of
-- these tables can be written by dealership staff at all.
-- ---------------------------------------------------------------------------

alter table public.plans enable row level security;
alter table public.platform_features enable row level security;
alter table public.plan_features enable row level security;
alter table public.tenant_subscriptions enable row level security;
alter table public.subscription_invoices enable row level security;
alter table public.subscription_transactions enable row level security;
alter table public.tenant_settings enable row level security;
alter table public.tenant_domains enable row level security;

revoke all on public.plans, public.platform_features, public.plan_features, public.tenant_subscriptions,
  public.subscription_invoices, public.subscription_transactions, public.tenant_settings,
  public.tenant_domains
  from anon, authenticated;
grant select on public.plans, public.platform_features, public.plan_features, public.tenant_subscriptions,
  public.subscription_invoices, public.subscription_transactions, public.tenant_settings,
  public.tenant_domains
  to authenticated;
grant insert, update on public.plans, public.subscription_invoices, public.tenant_settings to authenticated;
grant insert, update, delete on public.plan_features, public.tenant_domains to authenticated;
grant all on public.plans, public.platform_features, public.plan_features, public.tenant_subscriptions,
  public.subscription_invoices, public.subscription_transactions, public.tenant_settings,
  public.tenant_domains
  to service_role;
revoke all on sequence public.subscription_invoice_number_seq from anon;
grant usage on sequence public.subscription_invoice_number_seq to authenticated, service_role;

create policy plans_select on public.plans for select to authenticated
  using ((select public.has_platform_permission('plans.view')));
create policy plans_insert on public.plans for insert to authenticated
  with check ((select public.has_platform_permission('plans.manage')));
create policy plans_update on public.plans for update to authenticated
  using ((select public.has_platform_permission('plans.manage')))
  with check ((select public.has_platform_permission('plans.manage')));

create policy platform_features_select on public.platform_features for select to authenticated
  using ((select public.has_platform_permission('plans.view')));

create policy plan_features_select on public.plan_features for select to authenticated
  using ((select public.has_platform_permission('plans.view')));
create policy plan_features_write on public.plan_features for all to authenticated
  using ((select public.has_platform_permission('plans.manage')))
  with check ((select public.has_platform_permission('plans.manage')));

create policy tenant_subscriptions_select on public.tenant_subscriptions for select to authenticated
  using (
    (select public.has_platform_permission('subscriptions.view'))
    or (tenant_id = (select public.current_tenant_id()) and (select public.has_permission('settings.view')))
  );

create policy subscription_invoices_select on public.subscription_invoices for select to authenticated
  using (
    (select public.has_platform_permission('billing.view'))
    or (
      tenant_id = (select public.current_tenant_id())
      and status <> 'draft'
      and (select public.has_permission('settings.manage'))
    )
  );
create policy subscription_invoices_insert on public.subscription_invoices for insert to authenticated
  with check ((select public.has_platform_permission('billing.manage')));
create policy subscription_invoices_update on public.subscription_invoices for update to authenticated
  using ((select public.has_platform_permission('billing.manage')))
  with check ((select public.has_platform_permission('billing.manage')));

create policy subscription_transactions_select on public.subscription_transactions for select to authenticated
  using (
    (select public.has_platform_permission('billing.view'))
    or (tenant_id = (select public.current_tenant_id()) and (select public.has_permission('settings.manage')))
  );

create policy tenant_settings_select on public.tenant_settings for select to authenticated
  using (
    (select public.has_platform_permission('tenants.view'))
    or tenant_id = (select public.current_tenant_id())
  );
create policy tenant_settings_insert on public.tenant_settings for insert to authenticated
  with check ((select public.has_platform_permission('tenants.manage')));
create policy tenant_settings_update on public.tenant_settings for update to authenticated
  using ((select public.has_platform_permission('tenants.manage')))
  with check ((select public.has_platform_permission('tenants.manage')));

create policy tenant_domains_select on public.tenant_domains for select to authenticated
  using (
    (select public.has_platform_permission('tenants.view'))
    or tenant_id = (select public.current_tenant_id())
  );
create policy tenant_domains_write on public.tenant_domains for all to authenticated
  using ((select public.has_platform_permission('tenants.manage')))
  with check ((select public.has_platform_permission('tenants.manage')));

create trigger platform_audit_row after insert or update or delete on public.plans
  for each row execute function public.platform_audit_row();
create trigger platform_audit_row after insert or update or delete on public.plan_features
  for each row execute function public.platform_audit_row();
create trigger platform_audit_row after insert or update on public.tenant_subscriptions
  for each row execute function public.platform_audit_row();
create trigger platform_audit_row after insert or update on public.subscription_invoices
  for each row execute function public.platform_audit_row();
create trigger platform_audit_row after insert on public.subscription_transactions
  for each row execute function public.platform_audit_row();
create trigger platform_audit_row after insert or update on public.tenant_settings
  for each row execute function public.platform_audit_row();
create trigger platform_audit_row after insert or update or delete on public.tenant_domains
  for each row execute function public.platform_audit_row();

-- ---------------------------------------------------------------------------
-- Starting data
-- ---------------------------------------------------------------------------

insert into public.platform_features (key, name, description, permission_modules, sort_order) values
  ('acquisitions', 'Acquisitions', 'Buying cars: purchase records, approvals and expenses.', array['acquisition'], 10),
  ('pricing', 'Pricing', 'Price management, approvals and history.', array['pricing'], 20),
  ('bookings', 'Bookings and sales', 'Reservations, deposits, payments and sales.', array['reservation', 'sale'], 30),
  ('staff_documents', 'Staff documents', 'The Documents screen for staff files.', '{}', 40),
  ('vehicle_sharing', 'Public share links', 'Customer-facing pages for a car.', '{}', 50);

insert into public.plans (key, name, description, max_users, max_branches, max_vehicles, max_storage_mb, sort_order) values
  ('starter', 'Starter', 'For a single small showroom.', 5, 1, 50, 2048, 10),
  ('growth', 'Growth', 'For a growing dealership.', 15, 3, 200, 10240, 20),
  ('professional', 'Professional', 'For established multi-branch dealerships.', 50, 10, 1000, 51200, 30),
  ('enterprise', 'Enterprise', 'Unlimited, for large groups.', null, null, null, null, 40);

insert into public.plan_features (plan_id, feature_key, enabled)
select p.id, f.key,
  case p.key
    when 'starter' then f.key in ('acquisitions', 'pricing', 'bookings')
    when 'growth' then f.key <> 'staff_documents'
    else true
  end
from public.plans p cross join public.platform_features f;

insert into public.tenant_settings (tenant_id, display_name)
select id, name from public.tenants;

-- No expiry and no limits: Zohaan Motors carries on exactly as before.
insert into public.tenant_subscriptions (tenant_id, plan_id, status, billing_cycle, current_period_end)
select t.id, p.id, 'active', 'custom', null
from public.tenants t cross join public.plans p
where p.key = 'enterprise' and t.id = '00000000-0000-4000-8000-000000000001';

-- ---------------------------------------------------------------------------
-- Actions. Each checks its own permission, because definer functions bypass the policies above.
-- ---------------------------------------------------------------------------

-- Tells a dealership's Super Admins. Internal.
create function public.notify_tenant_admins(
  p_tenant_id uuid, p_type text, p_title text, p_message text, p_data jsonb default '{}'::jsonb
)
returns void
language sql
security definer
set search_path = public
as $$
  insert into public.notifications (tenant_id, user_id, type, title, message, entity_type, data)
  select p_tenant_id, admin_id, p_type, p_title, p_message, 'subscription', p_data
  from public.active_super_admin_ids(p_tenant_id) as admin_id;
$$;

revoke all on function public.notify_tenant_admins(uuid, text, text, text, jsonb) from public, anon, authenticated;

create function public.platform_set_tenant_status(p_tenant_id uuid, p_status text, p_reason text default null)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  v_old text;
begin
  if not public.has_platform_permission('tenants.manage') then
    raise exception 'not authorized' using errcode = '42501';
  end if;
  if p_status not in ('active', 'suspended') then
    raise exception 'invalid status' using errcode = '22023';
  end if;

  select status into v_old from public.tenants where id = p_tenant_id for update;
  if v_old is null then
    raise exception 'tenant not found' using errcode = 'P0002';
  end if;
  if v_old = p_status then
    return;
  end if;

  update public.tenants set status = p_status where id = p_tenant_id;
  perform public.platform_log(
    case p_status when 'suspended' then 'tenant.suspended' else 'tenant.activated' end,
    'tenants', p_tenant_id, p_tenant_id, null, null, jsonb_build_object('reason', p_reason)
  );

  -- Staff of a suspended dealership can't sign in to read this; the server also emails them.
  perform public.notify_tenant_admins(
    p_tenant_id,
    case p_status when 'suspended' then 'tenant_suspended' else 'tenant_reactivated' end,
    case p_status when 'suspended' then 'Account suspended' else 'Account reactivated' end,
    case p_status
      when 'suspended' then 'Your dealership account has been suspended. Contact AutoNexa support.'
      else 'Your dealership account is active again.'
    end,
    jsonb_build_object('reason', p_reason)
  );
end;
$$;

create function public.platform_assign_plan(
  p_tenant_id uuid,
  p_plan_id uuid,
  p_status text default 'active',
  p_billing_cycle text default 'monthly',
  p_period_end timestamptz default null
)
returns uuid
language plpgsql
security definer
set search_path = public
as $$
declare
  v_plan public.plans%rowtype;
  v_previous_plan text;
  v_id uuid;
begin
  if not public.has_platform_permission('subscriptions.manage') then
    raise exception 'not authorized' using errcode = '42501';
  end if;
  if p_status not in ('trialing', 'active') then
    raise exception 'invalid status' using errcode = '22023';
  end if;
  if p_period_end is not null and p_period_end <= now() then
    raise exception 'the period must end in the future' using errcode = '22023';
  end if;
  select * into v_plan from public.plans where id = p_plan_id and is_active;
  if not found then
    raise exception 'plan not found' using errcode = 'P0002';
  end if;
  if not exists (select 1 from public.tenants where id = p_tenant_id) then
    raise exception 'tenant not found' using errcode = 'P0002';
  end if;

  select p.name into v_previous_plan
  from public.tenant_subscriptions s
  join public.plans p on p.id = s.plan_id
  where s.tenant_id = p_tenant_id and s.status in ('trialing', 'active', 'past_due');

  update public.tenant_subscriptions
  set status = 'cancelled', ended_at = now()
  where tenant_id = p_tenant_id and status in ('trialing', 'active', 'past_due');

  insert into public.tenant_subscriptions (tenant_id, plan_id, status, billing_cycle, current_period_end, created_by)
  values (p_tenant_id, p_plan_id, p_status, p_billing_cycle, p_period_end, auth.uid())
  returning id into v_id;

  if v_previous_plan is not null then
    perform public.notify_tenant_admins(
      p_tenant_id, 'subscription_plan_changed', 'Your plan has changed',
      format('Your dealership moved from %s to %s.', v_previous_plan, v_plan.name),
      jsonb_build_object('previousPlan', v_previous_plan, 'plan', v_plan.name)
    );
  end if;

  return v_id;
end;
$$;

create function public.platform_renew_subscription(p_subscription_id uuid, p_period_end timestamptz)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  v_row public.tenant_subscriptions%rowtype;
begin
  if not public.has_platform_permission('subscriptions.manage') then
    raise exception 'not authorized' using errcode = '42501';
  end if;
  if p_period_end is null or p_period_end <= now() then
    raise exception 'the period must end in the future' using errcode = '22023';
  end if;

  select * into v_row from public.tenant_subscriptions where id = p_subscription_id for update;
  if not found then
    raise exception 'subscription not found' using errcode = 'P0002';
  end if;
  if v_row.status = 'cancelled' then
    raise exception 'a cancelled subscription cannot be renewed: assign a plan instead' using errcode = '22023';
  end if;

  update public.tenant_subscriptions
  set status = 'active', current_period_end = p_period_end, expiry_notice_days = null, ended_at = null
  where id = p_subscription_id;

  perform public.notify_tenant_admins(
    v_row.tenant_id, 'subscription_renewed', 'Subscription renewed',
    format('Your subscription now runs until %s.', to_char(p_period_end, 'DD Mon YYYY')),
    jsonb_build_object('periodEnd', p_period_end)
  );
end;
$$;

create function public.platform_cancel_subscription(p_subscription_id uuid, p_reason text default null)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  v_tenant uuid;
begin
  if not public.has_platform_permission('subscriptions.manage') then
    raise exception 'not authorized' using errcode = '42501';
  end if;
  update public.tenant_subscriptions
  set status = 'cancelled', ended_at = now()
  where id = p_subscription_id and status in ('trialing', 'active', 'past_due', 'expired')
  returning tenant_id into v_tenant;
  if v_tenant is null then
    raise exception 'subscription not found' using errcode = 'P0002';
  end if;
  perform public.platform_log('subscription.cancelled', 'tenant_subscriptions', p_subscription_id, v_tenant,
    null, null, jsonb_build_object('reason', p_reason));
  perform public.notify_tenant_admins(
    v_tenant, 'subscription_cancelled', 'Subscription cancelled',
    'Your subscription was cancelled. Existing records stay available, and new ones are paused.',
    jsonb_build_object('reason', p_reason)
  );
end;
$$;

-- Records money received or reversed. The invoice becomes paid once it is covered in full.
create function public.platform_record_payment(
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

-- Counts only, per dealership. Nothing a dealership keeps private can be read through this.
create function public.tenant_usage_counts(p_tenant_id uuid)
returns table (users bigint, branches bigint, vehicles bigint, storage_bytes bigint)
language sql
stable
security definer
set search_path = public
as $$
  select
    (select count(*) from public.tenant_members m
     join public.profiles p on p.id = m.user_id
     where m.tenant_id = p_tenant_id and m.status = 'active' and p.deleted_at is null and p.status <> 'disabled'),
    (select count(*) from public.branches b where b.tenant_id = p_tenant_id and b.is_active),
    (select coalesce(sum(coalesce(v.quantity, 1)), 0)::bigint from public.vehicles v
     where v.tenant_id = p_tenant_id and v.deleted_at is null
       and v.status not in ('sold', 'delivered', 'returned', 'archived')),
    -- Split units share their photo files, so each file counts once.
    (select coalesce(sum(size), 0)::bigint from (
       select max(file_size) as size from public.vehicle_photos
       where tenant_id = p_tenant_id group by storage_path
       union all
       select file_size from public.documents where tenant_id = p_tenant_id and deleted_at is null
       union all
       select file_size from public.staff_documents where tenant_id = p_tenant_id
     ) files);
$$;

revoke all on function public.tenant_usage_counts(uuid) from public, anon, authenticated;
grant execute on function public.tenant_usage_counts(uuid) to service_role;

create function public.platform_usage()
returns table (tenant_id uuid, users bigint, branches bigint, vehicles bigint, storage_bytes bigint)
language plpgsql
stable
security definer
set search_path = public
as $$
begin
  if not public.has_platform_permission('usage.view') then
    raise exception 'not authorized' using errcode = '42501';
  end if;
  return query
    select t.id, u.users, u.branches, u.vehicles, u.storage_bytes
    from public.tenants t
    cross join lateral public.tenant_usage_counts(t.id) u;
end;
$$;

revoke all on function public.platform_set_tenant_status(uuid, text, text) from public, anon;
revoke all on function public.platform_assign_plan(uuid, uuid, text, text, timestamptz) from public, anon;
revoke all on function public.platform_renew_subscription(uuid, timestamptz) from public, anon;
revoke all on function public.platform_cancel_subscription(uuid, text) from public, anon;
revoke all on function public.platform_record_payment(uuid, numeric, text, text, text, timestamptz) from public, anon;
revoke all on function public.platform_usage() from public, anon;
grant execute on function public.platform_set_tenant_status(uuid, text, text) to authenticated, service_role;
grant execute on function public.platform_assign_plan(uuid, uuid, text, text, timestamptz) to authenticated, service_role;
grant execute on function public.platform_renew_subscription(uuid, timestamptz) to authenticated, service_role;
grant execute on function public.platform_cancel_subscription(uuid, text) to authenticated, service_role;
grant execute on function public.platform_record_payment(uuid, numeric, text, text, text, timestamptz) to authenticated, service_role;
grant execute on function public.platform_usage() to authenticated, service_role;
