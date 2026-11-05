-- Phase 9 pricing schema smoke tests (transaction rolled back).
-- Permission-gated RPCs are covered by app/API tests; this checks constraints + helpers.
begin;

do $$
declare
  v_branch uuid;
  v_loc uuid;
  v_vehicle uuid;
  v_workshop numeric;
begin
  select id into v_branch from public.branches limit 1;
  if v_branch is null then
    insert into public.branches (name, code, emirate, city, is_active)
    values ('Pricing Test Branch', 'PRC-01', 'dubai', 'Dubai', true)
    returning id into v_branch;
  end if;

  insert into public.branch_locations (branch_id, name, location_type)
  values (v_branch, 'Pricing Yard', 'yard')
  returning id into v_loc;

  insert into public.vehicles (
    stock_number, make, model, year, branch_id, location_id, status,
    total_acquisition_cost, current_selling_price, minimum_selling_price
  )
  values (
    '', 'Toyota', 'Camry', 2023, v_branch, v_loc, 'ready_for_sale',
    80000, 90000, 85000
  )
  returning id into v_vehicle;

  -- Workshop actual helper returns 0 with no orders
  v_workshop := public.vehicle_workshop_actual_cost(v_vehicle);
  if v_workshop is distinct from 0 then
    raise exception 'expected zero workshop cost, got %', v_workshop;
  end if;

  -- Create pricing row
  insert into public.vehicle_pricing (
    vehicle_id,
    minimum_selling_price,
    target_selling_price,
    advertised_price,
    current_selling_price,
    pricing_status,
    change_reason
  ) values (
    v_vehicle, 85000, 95000, 97500, 95000, 'active', 'initial_pricing'
  );

  -- History insert
  insert into public.vehicle_pricing_history (
    vehicle_id,
    previous_current_price,
    new_current_price,
    reason
  ) values (
    v_vehicle, 90000, 95000, 'customer_negotiation'
  );

  -- Unique current pricing enforced
  begin
    insert into public.vehicle_pricing (vehicle_id, current_selling_price)
    values (v_vehicle, 91000);
    raise exception 'expected unique vehicle_pricing to fail';
  exception
    when unique_violation then null;
  end;

  -- Non-negative constraints
  begin
    update public.vehicle_pricing
    set current_selling_price = -1
    where vehicle_id = v_vehicle;
    raise exception 'expected negative current price to fail';
  exception
    when check_violation then null;
  end;

  -- Min <= target
  begin
    update public.vehicle_pricing
    set minimum_selling_price = 100000, target_selling_price = 90000
    where vehicle_id = v_vehicle;
    raise exception 'expected min > target to fail';
  exception
    when check_violation then null;
  end;

  raise notice 'phase9_pricing checks passed';
end $$;

rollback;
