-- get_vehicle_profitability() failed for users who may see prices but not costs (Sales
-- Executives: vehicle.price.view only) with 'record "v_totals" is not assigned yet', so the
-- Pricing tab couldn't load their target selling price and maximum discount.
-- Same function as before, with v_totals assigned empty values for those users.

CREATE OR REPLACE FUNCTION public.get_vehicle_profitability(p_vehicle_id uuid, p_selling_price numeric DEFAULT NULL::numeric)
 RETURNS jsonb
 LANGUAGE plpgsql
 STABLE SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
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
  else
    -- Price-only roles (Sales Executives) never see costs, but the checks below still read
    -- v_totals, which fails on an unassigned record. Give it empty values instead.
    select
      null::numeric as purchase_cost,
      null::numeric as acquisition_expenses,
      null::numeric as acquisition_total,
      null::numeric as workshop_cost,
      null::numeric as other_costs,
      null::numeric as total_vehicle_cost
    into v_totals;
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
    'purchaseCost', case when v_can_cost or v_can_profit then v_totals.purchase_cost else null end,
    'acquisitionExpenses', case when v_can_cost or v_can_profit then v_totals.acquisition_expenses else null end,
    'workshopCost', case when v_can_cost or v_can_profit then v_totals.workshop_cost else null end,
    'otherVehicleCosts', case when v_can_cost or v_can_profit then v_totals.other_costs else null end,
    'totalVehicleCost', case when v_can_cost or v_can_profit then v_totals.total_vehicle_cost else null end,
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
$function$;
