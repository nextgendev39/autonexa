-- Phase 9: Pricing & Profitability
-- Aggregates acquisition + workshop costs. Does NOT duplicate source ledgers.
-- Pricing-specific fields live on vehicle_pricing; vehicles.current/minimum stay synced.

-- ---------------------------------------------------------------------------
-- Enums
-- ---------------------------------------------------------------------------

do $$ begin
  create type public.pricing_status as enum (
    'draft',
    'pending_approval',
    'approved',
    'active',
    'discount_approval_required',
    'below_minimum',
    'sold',
    'cancelled'
  );
exception when duplicate_object then null;
end $$;

do $$ begin
  create type public.pricing_change_reason as enum (
    'market_adjustment',
    'competitor_pricing',
    'customer_negotiation',
    'clearance',
    'vehicle_condition',
    'management_decision',
    'promotion',
    'initial_pricing',
    'cost_refresh',
    'approval',
    'override',
    'other'
  );
exception when duplicate_object then null;
end $$;

-- ---------------------------------------------------------------------------
-- vehicle_pricing (one current record per vehicle)
-- ---------------------------------------------------------------------------

create table if not exists public.vehicle_pricing (
  id uuid primary key default gen_random_uuid(),
  vehicle_id uuid not null references public.vehicles (id) on delete cascade,
  minimum_selling_price numeric(14, 2),
  target_selling_price numeric(14, 2),
  advertised_price numeric(14, 2),
  current_selling_price numeric(14, 2),
  maximum_discount_amount numeric(14, 2),
  maximum_discount_percent numeric(5, 2),
  pricing_status public.pricing_status not null default 'draft',
  pricing_notes text,
  change_reason public.pricing_change_reason,
  change_notes text,
  override_minimum boolean not null default false,
  override_reason text,
  approved_by uuid references public.profiles (id) on delete set null,
  approved_at timestamptz,
  effective_from timestamptz not null default timezone('utc', now()),
  created_by uuid references public.profiles (id) on delete set null,
  updated_by uuid references public.profiles (id) on delete set null,
  created_at timestamptz not null default timezone('utc', now()),
  updated_at timestamptz not null default timezone('utc', now()),
  constraint vehicle_pricing_vehicle_unique unique (vehicle_id),
  constraint vehicle_pricing_minimum_non_negative
    check (minimum_selling_price is null or minimum_selling_price >= 0),
  constraint vehicle_pricing_target_non_negative
    check (target_selling_price is null or target_selling_price >= 0),
  constraint vehicle_pricing_advertised_non_negative
    check (advertised_price is null or advertised_price >= 0),
  constraint vehicle_pricing_current_non_negative
    check (current_selling_price is null or current_selling_price >= 0),
  constraint vehicle_pricing_max_discount_amount_non_negative
    check (maximum_discount_amount is null or maximum_discount_amount >= 0),
  constraint vehicle_pricing_max_discount_percent_range
    check (
      maximum_discount_percent is null
      or (maximum_discount_percent >= 0 and maximum_discount_percent <= 100)
    ),
  constraint vehicle_pricing_min_lte_target
    check (
      minimum_selling_price is null
      or target_selling_price is null
      or minimum_selling_price <= target_selling_price
    ),
  constraint vehicle_pricing_override_reason_required
    check (
      (not override_minimum)
      or (override_reason is not null and length(trim(override_reason)) > 0)
    )
);

create index if not exists vehicle_pricing_status_idx
  on public.vehicle_pricing (pricing_status);

create index if not exists vehicle_pricing_updated_at_idx
  on public.vehicle_pricing (updated_at desc);

drop trigger if exists vehicle_pricing_set_updated_at on public.vehicle_pricing;
create trigger vehicle_pricing_set_updated_at
before update on public.vehicle_pricing
for each row execute function public.set_updated_at();

alter table public.vehicle_pricing enable row level security;

-- ---------------------------------------------------------------------------
-- vehicle_pricing_history (append-only)
-- ---------------------------------------------------------------------------

create table if not exists public.vehicle_pricing_history (
  id uuid primary key default gen_random_uuid(),
  vehicle_id uuid not null references public.vehicles (id) on delete cascade,
  pricing_id uuid references public.vehicle_pricing (id) on delete set null,
  previous_minimum_price numeric(14, 2),
  new_minimum_price numeric(14, 2),
  previous_target_price numeric(14, 2),
  new_target_price numeric(14, 2),
  previous_advertised_price numeric(14, 2),
  new_advertised_price numeric(14, 2),
  previous_current_price numeric(14, 2),
  new_current_price numeric(14, 2),
  previous_discount numeric(14, 2),
  new_discount numeric(14, 2),
  previous_status public.pricing_status,
  new_status public.pricing_status,
  reason public.pricing_change_reason,
  notes text,
  override_minimum boolean not null default false,
  changed_by uuid references public.profiles (id) on delete set null,
  changed_at timestamptz not null default timezone('utc', now())
);

create index if not exists vehicle_pricing_history_vehicle_id_idx
  on public.vehicle_pricing_history (vehicle_id, changed_at desc);

create index if not exists vehicle_pricing_history_pricing_id_idx
  on public.vehicle_pricing_history (pricing_id);

alter table public.vehicle_pricing_history enable row level security;

-- ---------------------------------------------------------------------------
-- Backfill pricing rows from existing vehicle price columns
-- ---------------------------------------------------------------------------

insert into public.vehicle_pricing (
  vehicle_id,
  minimum_selling_price,
  current_selling_price,
  target_selling_price,
  advertised_price,
  pricing_status,
  change_reason,
  created_by,
  updated_by
)
select
  v.id,
  v.minimum_selling_price,
  v.current_selling_price,
  v.current_selling_price,
  v.current_selling_price,
  case
    when v.status in ('sold', 'delivered') then 'sold'::public.pricing_status
    when v.current_selling_price is not null then 'active'::public.pricing_status
    else 'draft'::public.pricing_status
  end,
  'initial_pricing'::public.pricing_change_reason,
  v.created_by,
  v.updated_by
from public.vehicles v
where v.deleted_at is null
  and not exists (
    select 1 from public.vehicle_pricing p where p.vehicle_id = v.id
  )
  and (
    v.current_selling_price is not null
    or v.minimum_selling_price is not null
  );

-- ---------------------------------------------------------------------------
-- Cost aggregation helpers (read source modules — never duplicate)
-- ---------------------------------------------------------------------------

create or replace function public.vehicle_workshop_actual_cost(p_vehicle_id uuid)
returns numeric
language sql
stable
security definer
set search_path = public
as $$
  select coalesce(sum(o.actual_total_cost), 0)::numeric(14, 2)
  from public.workshop_orders o
  where o.vehicle_id = p_vehicle_id
    and o.status = 'completed';
$$;

create or replace function public.vehicle_other_expense_cost(p_vehicle_id uuid)
returns numeric
language sql
stable
security definer
set search_path = public
as $$
  -- Expenses not tied to an acquisition (acquisition already rolled into total_acquisition_cost).
  select coalesce(sum(e.amount), 0)::numeric(14, 2)
  from public.vehicle_expenses e
  where e.vehicle_id = p_vehicle_id
    and e.acquisition_id is null;
$$;

create or replace function public.get_vehicle_total_cost(p_vehicle_id uuid)
returns table (
  purchase_cost numeric,
  acquisition_expenses numeric,
  acquisition_total numeric,
  workshop_cost numeric,
  other_costs numeric,
  total_vehicle_cost numeric
)
language plpgsql
stable
security definer
set search_path = public
as $$
declare
  v_branch uuid;
  v_vehicle_acq_total numeric(14, 2) := 0;
  v_acq_total numeric(14, 2) := 0;
  v_purchase numeric(14, 2) := 0;
  v_asking numeric(14, 2);
  v_purchase_line numeric(14, 2);
  v_acq_expenses numeric(14, 2) := 0;
  v_workshop numeric(14, 2) := 0;
  v_other numeric(14, 2) := 0;
  v_acquisition_id uuid;
begin
  select v.branch_id, coalesce(v.total_acquisition_cost, 0)
  into v_branch, v_vehicle_acq_total
  from public.vehicles v
  where v.id = p_vehicle_id and v.deleted_at is null;

  if v_branch is null then
    return;
  end if;

  if not public.can_access_branch(v_branch) then
    raise exception 'not authorized for branch';
  end if;

  if not public.has_permission_for_branch('vehicle.cost.view', v_branch)
     and not public.has_permission_for_branch('pricing.view', v_branch)
     and not public.has_permission_for_branch('vehicle.profit.view', v_branch) then
    raise exception 'not authorized';
  end if;

  -- Prefer the most progressed non-cancelled acquisition linked to this vehicle.
  select a.id, a.purchase_price, a.asking_price
  into v_acquisition_id, v_purchase, v_asking
  from public.acquisitions a
  where a.vehicle_id = p_vehicle_id
    and a.status not in ('cancelled', 'rejected')
  order by
    case a.status::text
      when 'received' then 1
      when 'documents_pending' then 2
      when 'purchased' then 3
      when 'approved' then 4
      when 'pending_approval' then 5
      when 'negotiating' then 6
      when 'sourcing' then 7
      else 8
    end,
    coalesce(a.approved_at, a.purchase_date::timestamptz, a.updated_at) desc nulls last
  limit 1;

  if v_acquisition_id is not null then
    select e.amount
    into v_purchase_line
    from public.vehicle_expenses e
    where e.acquisition_id = v_acquisition_id
      and e.category = 'purchase'
    order by e.created_at desc
    limit 1;

    v_acq_expenses := public.acquisition_expense_sum(v_acquisition_id);

    -- Prefill purchase from acquisition price, purchase ledger line, then asking price.
    v_purchase := coalesce(v_purchase, v_purchase_line, v_asking, 0);
    -- Keep total aligned with the resolved purchase figure (asking may prefill before purchase).
    v_acq_total := (coalesce(v_purchase, 0) + coalesce(v_acq_expenses, 0))::numeric(14, 2);

    -- Prefer the confirmed vehicle snapshot when it is higher (post-purchase sync).
    if v_vehicle_acq_total > coalesce(v_acq_total, 0) then
      v_acq_total := v_vehicle_acq_total;
      if coalesce(v_purchase, 0) = 0 then
        v_purchase := greatest(v_vehicle_acq_total - coalesce(v_acq_expenses, 0), 0);
      end if;
    end if;
  else
    select coalesce(sum(e.amount), 0)::numeric(14, 2)
    into v_purchase
    from public.vehicle_expenses e
    where e.vehicle_id = p_vehicle_id
      and e.category = 'purchase';

    if coalesce(v_purchase, 0) = 0 then
      v_purchase := v_vehicle_acq_total;
    end if;

    v_acq_expenses := 0;
    v_acq_total := v_vehicle_acq_total;
  end if;

  v_workshop := public.vehicle_workshop_actual_cost(p_vehicle_id);
  v_other := public.vehicle_other_expense_cost(p_vehicle_id);

  return query
  select
    coalesce(v_purchase, 0)::numeric(14, 2),
    coalesce(v_acq_expenses, 0)::numeric(14, 2),
    coalesce(v_acq_total, 0)::numeric(14, 2),
    coalesce(v_workshop, 0)::numeric(14, 2),
    coalesce(v_other, 0)::numeric(14, 2),
    (coalesce(v_acq_total, 0) + coalesce(v_workshop, 0) + coalesce(v_other, 0))::numeric(14, 2);
end;
$$;

create or replace function public.get_vehicle_cost_breakdown(p_vehicle_id uuid)
returns jsonb
language plpgsql
stable
security definer
set search_path = public
as $$
declare
  v_branch uuid;
  v_lines jsonb := '[]'::jsonb;
  v_totals record;
begin
  select branch_id into v_branch
  from public.vehicles
  where id = p_vehicle_id and deleted_at is null;

  if v_branch is null then
    raise exception 'vehicle not found';
  end if;

  if not public.can_access_branch(v_branch) then
    raise exception 'not authorized for branch';
  end if;

  if not public.has_permission_for_branch('vehicle.cost.view', v_branch)
     and not public.has_permission_for_branch('pricing.view', v_branch) then
    raise exception 'not authorized';
  end if;

  select * into v_totals from public.get_vehicle_total_cost(p_vehicle_id);

  -- Category lines exclude purchase (shown separately as purchaseCost).
  select coalesce(jsonb_agg(
    jsonb_build_object(
      'category', category,
      'amount', amount
    )
    order by category
  ), '[]'::jsonb)
  into v_lines
  from (
    select e.category::text as category, sum(e.amount)::numeric(14, 2) as amount
    from public.vehicle_expenses e
    where e.vehicle_id = p_vehicle_id
      and e.acquisition_id is not null
      and e.category is distinct from 'purchase'
    group by e.category
  ) x;

  return jsonb_build_object(
    'purchaseCost', coalesce(v_totals.purchase_cost, 0),
    'acquisitionExpenses', coalesce(v_totals.acquisition_expenses, 0),
    'acquisitionTotal', coalesce(v_totals.acquisition_total, 0),
    'workshopCost', coalesce(v_totals.workshop_cost, 0),
    'otherCosts', coalesce(v_totals.other_costs, 0),
    'totalVehicleCost', coalesce(v_totals.total_vehicle_cost, 0),
    'acquisitionLines', v_lines,
    'currency', 'AED'
  );
end;
$$;

create or replace function public.get_vehicle_profitability(
  p_vehicle_id uuid,
  p_selling_price numeric default null
)
returns jsonb
language plpgsql
stable
security definer
set search_path = public
as $$
declare
  v_branch uuid;
  v_totals record;
  v_pricing public.vehicle_pricing%rowtype;
  v_vehicle public.vehicles%rowtype;
  v_sell numeric(14, 2);
  v_advertised numeric(14, 2);
  v_discount numeric(14, 2) := 0;
  v_discount_pct numeric(8, 4) := 0;
  v_profit numeric(14, 2);
  v_margin numeric(8, 4);
  v_can_cost boolean;
  v_can_profit boolean;
  v_can_price boolean;
begin
  select * into v_vehicle
  from public.vehicles
  where id = p_vehicle_id and deleted_at is null;

  if not found then
    raise exception 'vehicle not found';
  end if;

  v_branch := v_vehicle.branch_id;

  if not public.can_access_branch(v_branch) then
    raise exception 'not authorized for branch';
  end if;

  v_can_cost := public.has_permission_for_branch('vehicle.cost.view', v_branch)
             or public.has_permission_for_branch('pricing.view', v_branch);
  v_can_profit := public.has_permission_for_branch('vehicle.profit.view', v_branch)
               or public.has_permission_for_branch('pricing.view', v_branch);
  v_can_price := public.has_permission_for_branch('vehicle.price.view', v_branch)
              or public.has_permission_for_branch('pricing.view', v_branch);

  if not (v_can_cost or v_can_profit or v_can_price) then
    raise exception 'not authorized';
  end if;

  select * into v_pricing from public.vehicle_pricing where vehicle_id = p_vehicle_id;

  if v_can_cost or v_can_profit then
    select * into v_totals from public.get_vehicle_total_cost(p_vehicle_id);
  end if;

  v_sell := coalesce(
    p_selling_price,
    v_pricing.current_selling_price,
    v_vehicle.current_selling_price
  );
  v_advertised := coalesce(v_pricing.advertised_price, v_sell);

  if v_advertised is not null and v_sell is not null and v_advertised > v_sell then
    v_discount := (v_advertised - v_sell)::numeric(14, 2);
    if v_advertised > 0 then
      v_discount_pct := round((v_discount / v_advertised) * 100, 2);
    end if;
  end if;

  if v_can_profit and v_totals.total_vehicle_cost is not null and v_sell is not null then
    v_profit := (v_sell - v_totals.total_vehicle_cost)::numeric(14, 2);
    if v_sell > 0 then
      v_margin := round((v_profit / v_sell) * 100, 2);
    else
      v_margin := 0;
    end if;
  end if;

  return jsonb_build_object(
    'vehicleId', p_vehicle_id,
    'currency', 'AED',
    'purchaseCost', case when v_can_cost or v_can_profit then coalesce(v_totals.purchase_cost, 0) else null end,
    'acquisitionExpenses', case when v_can_cost or v_can_profit then coalesce(v_totals.acquisition_expenses, 0) else null end,
    'workshopCost', case when v_can_cost or v_can_profit then coalesce(v_totals.workshop_cost, 0) else null end,
    'otherVehicleCosts', case when v_can_cost or v_can_profit then coalesce(v_totals.other_costs, 0) else null end,
    'totalVehicleCost', case when v_can_cost or v_can_profit then coalesce(v_totals.total_vehicle_cost, 0) else null end,
    'minimumSellingPrice', case
      when v_can_price or v_can_profit or v_can_cost
        then coalesce(v_pricing.minimum_selling_price, v_vehicle.minimum_selling_price)
      else null
    end,
    'targetSellingPrice', case when v_can_price then v_pricing.target_selling_price else null end,
    'advertisedPrice', case when v_can_price then v_pricing.advertised_price else null end,
    'currentSellingPrice', case when v_can_price then v_sell else null end,
    'maximumDiscountAmount', case when v_can_price then v_pricing.maximum_discount_amount else null end,
    'maximumDiscountPercent', case when v_can_price then v_pricing.maximum_discount_percent else null end,
    'discountAmount', case when v_can_price then v_discount else null end,
    'discountPercent', case when v_can_price then v_discount_pct else null end,
    'expectedGrossProfit', case when v_can_profit then v_profit else null end,
    'expectedMarginPercent', case when v_can_profit then v_margin else null end,
    'pricingStatus', v_pricing.pricing_status,
    'pricingNotes', case when v_can_price then v_pricing.pricing_notes else null end,
    'pricingId', v_pricing.id,
    'belowMinimum', case
      when v_sell is not null
           and coalesce(v_pricing.minimum_selling_price, v_vehicle.minimum_selling_price) is not null
        then v_sell < coalesce(v_pricing.minimum_selling_price, v_vehicle.minimum_selling_price)
      else false
    end,
    'isLoss', case when v_can_profit and v_profit is not null then v_profit < 0 else false end
  );
end;
$$;

-- Keep legacy profit RPC aligned with workshop-inclusive total when possible.
create or replace function public.read_vehicle_profit(p_vehicle_id uuid)
returns table (
  total_acquisition_cost numeric,
  current_selling_price numeric,
  minimum_selling_price numeric,
  estimated_margin numeric
)
language plpgsql
stable
security definer
set search_path = public
as $$
declare
  v_branch uuid;
  v_payload jsonb;
begin
  select v.branch_id into v_branch
  from public.vehicles v
  where v.id = p_vehicle_id and v.deleted_at is null;

  if v_branch is null then
    return;
  end if;

  if not public.has_permission_for_branch('vehicle.profit.view', v_branch)
     and not public.has_permission_for_branch('pricing.view', v_branch) then
    raise exception 'not authorized';
  end if;

  v_payload := public.get_vehicle_profitability(p_vehicle_id, null);

  return query
  select
    coalesce((v_payload ->> 'totalVehicleCost')::numeric, 0),
    (v_payload ->> 'currentSellingPrice')::numeric,
    (v_payload ->> 'minimumSellingPrice')::numeric,
    (v_payload ->> 'expectedGrossProfit')::numeric;
end;
$$;

-- ---------------------------------------------------------------------------
-- Upsert pricing (atomic + history + sync vehicle columns + audit)
-- ---------------------------------------------------------------------------

create or replace function public.upsert_vehicle_pricing(
  p_vehicle_id uuid,
  p_minimum_selling_price numeric default null,
  p_target_selling_price numeric default null,
  p_advertised_price numeric default null,
  p_current_selling_price numeric default null,
  p_maximum_discount_amount numeric default null,
  p_maximum_discount_percent numeric default null,
  p_pricing_notes text default null,
  p_change_reason public.pricing_change_reason default 'other',
  p_change_notes text default null,
  p_override_minimum boolean default false,
  p_override_reason text default null,
  p_submit_for_approval boolean default false
)
returns public.vehicle_pricing
language plpgsql
security definer
set search_path = public
as $$
declare
  v_vehicle public.vehicles%rowtype;
  v_old public.vehicle_pricing%rowtype;
  v_row public.vehicle_pricing%rowtype;
  v_status public.pricing_status;
  v_discount numeric(14, 2) := 0;
  v_old_discount numeric(14, 2) := 0;
  v_needs_approval boolean := false;
  v_below_min boolean := false;
begin
  select * into v_vehicle
  from public.vehicles
  where id = p_vehicle_id and deleted_at is null
  for update;

  if not found then
    raise exception 'vehicle not found';
  end if;

  if not public.can_access_branch(v_vehicle.branch_id) then
    raise exception 'not authorized for branch';
  end if;

  if not public.has_permission_for_branch('pricing.update', v_vehicle.branch_id)
     and not public.has_permission_for_branch('pricing.create', v_vehicle.branch_id)
     and not public.has_permission_for_branch('vehicle.price.edit', v_vehicle.branch_id) then
    raise exception 'not authorized';
  end if;

  if p_minimum_selling_price is not null and p_minimum_selling_price < 0 then
    raise exception 'minimum selling price cannot be negative';
  end if;
  if p_target_selling_price is not null and p_target_selling_price < 0 then
    raise exception 'target selling price cannot be negative';
  end if;
  if p_advertised_price is not null and p_advertised_price < 0 then
    raise exception 'advertised price cannot be negative';
  end if;
  if p_current_selling_price is not null and p_current_selling_price < 0 then
    raise exception 'current selling price cannot be negative';
  end if;
  if p_maximum_discount_amount is not null and p_maximum_discount_amount < 0 then
    raise exception 'maximum discount amount cannot be negative';
  end if;
  if p_maximum_discount_percent is not null
     and (p_maximum_discount_percent < 0 or p_maximum_discount_percent > 100) then
    raise exception 'maximum discount percent must be between 0 and 100';
  end if;
  if p_minimum_selling_price is not null
     and p_target_selling_price is not null
     and p_minimum_selling_price > p_target_selling_price then
    raise exception 'minimum selling price cannot exceed target selling price';
  end if;
  if p_advertised_price is not null
     and p_current_selling_price is not null
     and p_current_selling_price > p_advertised_price then
    raise exception 'current selling price cannot exceed advertised price';
  end if;

  select * into v_old from public.vehicle_pricing where vehicle_id = p_vehicle_id;

  if p_advertised_price is not null and p_current_selling_price is not null
     and p_advertised_price > p_current_selling_price then
    v_discount := p_advertised_price - p_current_selling_price;
  end if;

  if v_old.advertised_price is not null and v_old.current_selling_price is not null
     and v_old.advertised_price > v_old.current_selling_price then
    v_old_discount := v_old.advertised_price - v_old.current_selling_price;
  end if;

  -- Discount limits
  if p_maximum_discount_amount is not null and v_discount > p_maximum_discount_amount then
    if not public.has_permission_for_branch('pricing.discount.approve', v_vehicle.branch_id) then
      v_needs_approval := true;
    end if;
  end if;
  if p_maximum_discount_percent is not null
     and p_advertised_price is not null
     and p_advertised_price > 0
     and (v_discount / p_advertised_price) * 100 > p_maximum_discount_percent then
    if not public.has_permission_for_branch('pricing.discount.approve', v_vehicle.branch_id) then
      v_needs_approval := true;
    end if;
  end if;

  -- Below minimum
  if p_current_selling_price is not null
     and p_minimum_selling_price is not null
     and p_current_selling_price < p_minimum_selling_price then
    v_below_min := true;
    if coalesce(p_override_minimum, false) then
      if not public.has_permission_for_branch('pricing.override_minimum', v_vehicle.branch_id) then
        raise exception 'minimum price override not authorized';
      end if;
      if p_override_reason is null or length(trim(p_override_reason)) = 0 then
        raise exception 'override reason required';
      end if;
    else
      v_needs_approval := true;
    end if;
  end if;

  if p_submit_for_approval or v_needs_approval then
    v_status := case
      when v_below_min and not coalesce(p_override_minimum, false)
        then 'discount_approval_required'::public.pricing_status
      when v_needs_approval then 'pending_approval'::public.pricing_status
      else 'pending_approval'::public.pricing_status
    end;
  elsif v_below_min and coalesce(p_override_minimum, false) then
    v_status := 'active'::public.pricing_status;
  elsif p_current_selling_price is not null then
    v_status := 'active'::public.pricing_status;
  else
    v_status := coalesce(v_old.pricing_status, 'draft'::public.pricing_status);
  end if;

  if found then
    update public.vehicle_pricing
    set
      minimum_selling_price = p_minimum_selling_price,
      target_selling_price = p_target_selling_price,
      advertised_price = p_advertised_price,
      current_selling_price = p_current_selling_price,
      maximum_discount_amount = p_maximum_discount_amount,
      maximum_discount_percent = p_maximum_discount_percent,
      pricing_status = v_status,
      pricing_notes = nullif(trim(coalesce(p_pricing_notes, '')), ''),
      change_reason = p_change_reason,
      change_notes = nullif(trim(coalesce(p_change_notes, '')), ''),
      override_minimum = coalesce(p_override_minimum, false),
      override_reason = case
        when coalesce(p_override_minimum, false) then trim(p_override_reason)
        else null
      end,
      updated_by = auth.uid(),
      effective_from = timezone('utc', now())
    where vehicle_id = p_vehicle_id
    returning * into v_row;
  else
    if not public.has_permission_for_branch('pricing.create', v_vehicle.branch_id)
       and not public.has_permission_for_branch('vehicle.price.edit', v_vehicle.branch_id) then
      raise exception 'not authorized';
    end if;

    insert into public.vehicle_pricing (
      vehicle_id,
      minimum_selling_price,
      target_selling_price,
      advertised_price,
      current_selling_price,
      maximum_discount_amount,
      maximum_discount_percent,
      pricing_status,
      pricing_notes,
      change_reason,
      change_notes,
      override_minimum,
      override_reason,
      created_by,
      updated_by
    ) values (
      p_vehicle_id,
      p_minimum_selling_price,
      p_target_selling_price,
      p_advertised_price,
      p_current_selling_price,
      p_maximum_discount_amount,
      p_maximum_discount_percent,
      v_status,
      nullif(trim(coalesce(p_pricing_notes, '')), ''),
      p_change_reason,
      nullif(trim(coalesce(p_change_notes, '')), ''),
      coalesce(p_override_minimum, false),
      case when coalesce(p_override_minimum, false) then trim(p_override_reason) else null end,
      auth.uid(),
      auth.uid()
    )
    returning * into v_row;
  end if;

  -- Sync canonical vehicle price columns (existing inventory UI depends on these).
  perform set_config(
    'app.vehicle_price_reason',
    coalesce(p_change_reason::text, 'pricing_update'),
    true
  );

  update public.vehicles
  set
    minimum_selling_price = v_row.minimum_selling_price,
    current_selling_price = v_row.current_selling_price,
    updated_by = auth.uid()
  where id = p_vehicle_id;

  insert into public.vehicle_pricing_history (
    vehicle_id,
    pricing_id,
    previous_minimum_price,
    new_minimum_price,
    previous_target_price,
    new_target_price,
    previous_advertised_price,
    new_advertised_price,
    previous_current_price,
    new_current_price,
    previous_discount,
    new_discount,
    previous_status,
    new_status,
    reason,
    notes,
    override_minimum,
    changed_by
  ) values (
    p_vehicle_id,
    v_row.id,
    v_old.minimum_selling_price,
    v_row.minimum_selling_price,
    v_old.target_selling_price,
    v_row.target_selling_price,
    v_old.advertised_price,
    v_row.advertised_price,
    v_old.current_selling_price,
    v_row.current_selling_price,
    nullif(v_old_discount, 0),
    nullif(v_discount, 0),
    v_old.pricing_status,
    v_row.pricing_status,
    p_change_reason,
    nullif(trim(coalesce(p_change_notes, p_pricing_notes, '')), ''),
    coalesce(p_override_minimum, false),
    auth.uid()
  );

  perform public.write_audit_log(
    case
      when v_old.id is null then 'PRICING_CREATED'
      when coalesce(p_override_minimum, false) then 'MINIMUM_PRICE_OVERRIDE'
      else 'PRICING_UPDATED'
    end,
    'vehicle_pricing',
    v_row.id,
    case when v_old.id is null then null else to_jsonb(v_old) end,
    to_jsonb(v_row),
    jsonb_build_object(
      'vehicle_id', p_vehicle_id,
      'reason', p_change_reason,
      'notes', nullif(trim(coalesce(p_change_notes, '')), ''),
      'override_minimum', coalesce(p_override_minimum, false),
      'override_reason', case when coalesce(p_override_minimum, false) then trim(p_override_reason) else null end
    )
  );

  if v_old.current_selling_price is distinct from v_row.current_selling_price then
    perform public.write_audit_log(
      'PRICE_CHANGED',
      'vehicles',
      p_vehicle_id,
      jsonb_build_object('current_selling_price', v_old.current_selling_price),
      jsonb_build_object('current_selling_price', v_row.current_selling_price),
      jsonb_build_object('pricing_id', v_row.id, 'reason', p_change_reason)
    );
  end if;

  return v_row;
end;
$$;

create or replace function public.approve_vehicle_pricing(
  p_vehicle_id uuid,
  p_note text default null,
  p_approve boolean default true
)
returns public.vehicle_pricing
language plpgsql
security definer
set search_path = public
as $$
declare
  v_row public.vehicle_pricing%rowtype;
  v_vehicle public.vehicles%rowtype;
  v_old public.vehicle_pricing%rowtype;
begin
  select * into v_vehicle
  from public.vehicles
  where id = p_vehicle_id and deleted_at is null;

  if not found then
    raise exception 'vehicle not found';
  end if;

  if not public.has_permission_for_branch('pricing.approve', v_vehicle.branch_id)
     and not public.has_permission_for_branch('pricing.discount.approve', v_vehicle.branch_id) then
    raise exception 'not authorized';
  end if;

  select * into v_old
  from public.vehicle_pricing
  where vehicle_id = p_vehicle_id
  for update;

  if not found then
    raise exception 'pricing not found';
  end if;

  if v_old.pricing_status not in ('pending_approval', 'discount_approval_required', 'below_minimum') then
    raise exception 'pricing is not awaiting approval';
  end if;

  update public.vehicle_pricing
  set
    pricing_status = case when p_approve then 'active'::public.pricing_status else 'draft'::public.pricing_status end,
    approved_by = case when p_approve then auth.uid() else null end,
    approved_at = case when p_approve then timezone('utc', now()) else null end,
    change_reason = 'approval',
    change_notes = nullif(trim(coalesce(p_note, '')), ''),
    updated_by = auth.uid()
  where vehicle_id = p_vehicle_id
  returning * into v_row;

  insert into public.vehicle_pricing_history (
    vehicle_id, pricing_id,
    previous_minimum_price, new_minimum_price,
    previous_target_price, new_target_price,
    previous_advertised_price, new_advertised_price,
    previous_current_price, new_current_price,
    previous_status, new_status,
    reason, notes, changed_by
  ) values (
    p_vehicle_id, v_row.id,
    v_old.minimum_selling_price, v_row.minimum_selling_price,
    v_old.target_selling_price, v_row.target_selling_price,
    v_old.advertised_price, v_row.advertised_price,
    v_old.current_selling_price, v_row.current_selling_price,
    v_old.pricing_status, v_row.pricing_status,
    'approval', nullif(trim(coalesce(p_note, '')), ''), auth.uid()
  );

  perform public.write_audit_log(
    case when p_approve then 'PRICING_APPROVED' else 'DISCOUNT_REJECTED' end,
    'vehicle_pricing',
    v_row.id,
    to_jsonb(v_old),
    to_jsonb(v_row),
    jsonb_build_object('vehicle_id', p_vehicle_id, 'note', nullif(trim(coalesce(p_note, '')), ''))
  );

  return v_row;
end;
$$;

-- ---------------------------------------------------------------------------
-- RLS
-- ---------------------------------------------------------------------------

drop policy if exists vehicle_pricing_select on public.vehicle_pricing;
create policy "vehicle_pricing_select"
  on public.vehicle_pricing for select to authenticated
  using (
    exists (
      select 1 from public.vehicles v
      where v.id = vehicle_pricing.vehicle_id
        and v.deleted_at is null
        and public.can_access_branch(v.branch_id)
        and (
          public.has_permission_for_branch('pricing.view', v.branch_id)
          or public.has_permission_for_branch('vehicle.price.view', v.branch_id)
        )
    )
  );

drop policy if exists vehicle_pricing_mutate on public.vehicle_pricing;
create policy "vehicle_pricing_mutate"
  on public.vehicle_pricing for all to authenticated
  using (
    exists (
      select 1 from public.vehicles v
      where v.id = vehicle_pricing.vehicle_id
        and v.deleted_at is null
        and public.can_access_branch(v.branch_id)
        and (
          public.has_permission_for_branch('pricing.update', v.branch_id)
          or public.has_permission_for_branch('pricing.create', v.branch_id)
          or public.has_permission_for_branch('vehicle.price.edit', v.branch_id)
        )
    )
  )
  with check (
    exists (
      select 1 from public.vehicles v
      where v.id = vehicle_pricing.vehicle_id
        and v.deleted_at is null
        and public.can_access_branch(v.branch_id)
        and (
          public.has_permission_for_branch('pricing.update', v.branch_id)
          or public.has_permission_for_branch('pricing.create', v.branch_id)
          or public.has_permission_for_branch('vehicle.price.edit', v.branch_id)
        )
    )
  );

drop policy if exists vehicle_pricing_history_select on public.vehicle_pricing_history;
create policy "vehicle_pricing_history_select"
  on public.vehicle_pricing_history for select to authenticated
  using (
    exists (
      select 1 from public.vehicles v
      where v.id = vehicle_pricing_history.vehicle_id
        and v.deleted_at is null
        and public.can_access_branch(v.branch_id)
        and (
          public.has_permission_for_branch('pricing.history.view', v.branch_id)
          or public.has_permission_for_branch('pricing.view', v.branch_id)
          or public.has_permission_for_branch('vehicle.price.view', v.branch_id)
        )
    )
  );

-- History is insert-only via SECURITY DEFINER RPCs
revoke insert, update, delete on public.vehicle_pricing_history from authenticated;
grant select on public.vehicle_pricing to authenticated;
grant select, insert, update on public.vehicle_pricing to authenticated;
grant select on public.vehicle_pricing_history to authenticated;

-- ---------------------------------------------------------------------------
-- Grants
-- ---------------------------------------------------------------------------

revoke all on function public.vehicle_workshop_actual_cost(uuid) from public;
revoke all on function public.vehicle_other_expense_cost(uuid) from public;
revoke all on function public.get_vehicle_total_cost(uuid) from public;
revoke all on function public.get_vehicle_cost_breakdown(uuid) from public;
revoke all on function public.get_vehicle_profitability(uuid, numeric) from public;
revoke all on function public.upsert_vehicle_pricing(uuid, numeric, numeric, numeric, numeric, numeric, numeric, text, public.pricing_change_reason, text, boolean, text, boolean) from public;
revoke all on function public.approve_vehicle_pricing(uuid, text, boolean) from public;

grant execute on function public.vehicle_workshop_actual_cost(uuid) to authenticated, service_role;
grant execute on function public.vehicle_other_expense_cost(uuid) to authenticated, service_role;
grant execute on function public.get_vehicle_total_cost(uuid) to authenticated, service_role;
grant execute on function public.get_vehicle_cost_breakdown(uuid) to authenticated, service_role;
grant execute on function public.get_vehicle_profitability(uuid, numeric) to authenticated, service_role;
grant execute on function public.upsert_vehicle_pricing(uuid, numeric, numeric, numeric, numeric, numeric, numeric, text, public.pricing_change_reason, text, boolean, text, boolean) to authenticated, service_role;
grant execute on function public.approve_vehicle_pricing(uuid, text, boolean) to authenticated, service_role;

-- ---------------------------------------------------------------------------
-- Permissions
-- ---------------------------------------------------------------------------

insert into public.permissions (key, name, module, description)
values
  ('pricing.view', 'View pricing', 'pricing', 'View vehicle pricing and cost summaries'),
  ('pricing.create', 'Create pricing', 'pricing', 'Create vehicle pricing records'),
  ('pricing.update', 'Update pricing', 'pricing', 'Update vehicle pricing records'),
  ('pricing.approve', 'Approve pricing', 'pricing', 'Approve pending pricing changes'),
  ('pricing.discount.approve', 'Approve discounts', 'pricing', 'Approve discounts that exceed limits or fall below minimum'),
  ('pricing.override_minimum', 'Override minimum price', 'pricing', 'Set selling price below minimum with reason'),
  ('pricing.history.view', 'View pricing history', 'pricing', 'View vehicle pricing change history')
on conflict (key) do update
set
  name = excluded.name,
  module = excluded.module,
  description = excluded.description;

insert into public.role_permissions (role_id, permission_id)
select r.id, p.id
from public.roles r
cross join public.permissions p
where r.key = 'super_admin'
  and p.key like 'pricing.%'
on conflict do nothing;

insert into public.role_permissions (role_id, permission_id)
select r.id, p.id
from public.roles r
join public.permissions p on p.key in (
  'pricing.view', 'pricing.create', 'pricing.update', 'pricing.approve',
  'pricing.discount.approve', 'pricing.override_minimum', 'pricing.history.view'
)
where r.key in ('admin', 'general_manager')
on conflict do nothing;

insert into public.role_permissions (role_id, permission_id)
select r.id, p.id
from public.roles r
join public.permissions p on p.key in (
  'pricing.view', 'pricing.create', 'pricing.update', 'pricing.history.view'
)
where r.key in ('inventory_manager')
on conflict do nothing;

insert into public.role_permissions (role_id, permission_id)
select r.id, p.id
from public.roles r
join public.permissions p on p.key in (
  'pricing.view', 'pricing.approve', 'pricing.discount.approve', 'pricing.history.view'
)
where r.key in ('sales_manager')
on conflict do nothing;

insert into public.role_permissions (role_id, permission_id)
select r.id, p.id
from public.roles r
join public.permissions p on p.key = 'pricing.view'
where r.key in ('sales_executive')
on conflict do nothing;

comment on table public.vehicle_pricing is
  'Current pricing decision per vehicle. Cost inputs come from acquisition + workshop; not duplicated here.';
comment on table public.vehicle_pricing_history is
  'Append-only pricing change history with reasons and overrides.';
comment on function public.get_vehicle_total_cost is
  'Aggregates acquisition total + completed workshop actual + other non-acquisition expenses.';
comment on function public.get_vehicle_profitability is
  'Authoritative gross profit/margin from live costs and current pricing.';
comment on function public.upsert_vehicle_pricing is
  'Atomic pricing upsert with history, vehicle price sync, and audit.';
