-- Split records (00050) share the acquisition of the record they were split from:
-- purchase price and acquisition costs are per unit, so cost and profit calculations
-- for a split record use the original record's acquisition.

/** The original record a split record came from (itself when not split). */
create or replace function public.vehicle_root_id(p_vehicle_id uuid)
returns uuid
language sql
stable
security definer
set search_path = public
as $$
  with recursive chain as (
    select id, split_from_id, 0 as depth
    from public.vehicles
    where id = p_vehicle_id
    union all
    select v.id, v.split_from_id, c.depth + 1
    from public.vehicles v
    join chain c on v.id = c.split_from_id
    where c.depth < 50
  )
  select coalesce((select id from chain where split_from_id is null limit 1), p_vehicle_id);
$$;

revoke all on function public.vehicle_root_id(uuid) from public;
grant execute on function public.vehicle_root_id(uuid) to authenticated, service_role;

-- Same as 00039, with the acquisition looked up on the root record.
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
  v_root uuid := public.vehicle_root_id(p_vehicle_id);
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

  select a.id, a.purchase_price, a.asking_price
  into v_acquisition_id, v_purchase, v_asking
  from public.acquisitions a
  -- Split records share the purchase of the record they came from.
  where a.vehicle_id = v_root
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
    v_purchase := coalesce(v_purchase, v_purchase_line, v_asking, 0);
    v_acq_total := (coalesce(v_purchase, 0) + coalesce(v_acq_expenses, 0))::numeric(14, 2);

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
    where e.vehicle_id = v_root
      and e.category = 'purchase';

    if coalesce(v_purchase, 0) = 0 then
      v_purchase := v_vehicle_acq_total;
    end if;

    v_acq_expenses := 0;
    v_acq_total := v_vehicle_acq_total;
  end if;

  v_workshop := 0;
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

-- Same as 00035, with acquisition expense lines read from the root record.
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
    where e.vehicle_id = public.vehicle_root_id(p_vehicle_id)
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
