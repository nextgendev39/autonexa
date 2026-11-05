-- Phase 6 acquisition business-rule smoke tests (transaction rolled back).
-- Prerequisite: apply supabase/migrations/00030_phase6_acquisitions.sql first
--   (local: npm run db:reset   or   npx supabase db push)
begin;

do $$
declare
  v_branch uuid;
  v_vehicle uuid;
  v_vehicle2 uuid;
  v_acq uuid;
  v_acq2 uuid;
  v_number text;
  v_expense uuid;
  v_total numeric;
begin
  if not exists (
    select 1
    from information_schema.columns
    where table_schema = 'public'
      and table_name = 'acquisitions'
      and column_name = 'acquisition_number'
  ) then
    raise exception
      'Phase 6 migration not applied: public.acquisitions.acquisition_number is missing. Run supabase/migrations/00030_phase6_acquisitions.sql first (npm run db:reset or npx supabase db push), then re-run this test.';
  end if;

  select id into v_branch from public.branches where code = 'DXB-01' limit 1;
  if v_branch is null then
    insert into public.branches (name, code, emirate, city, is_active)
    values ('Test Branch', 'TST-ACQ', 'dubai', 'Dubai', true)
    returning id into v_branch;
  end if;

  insert into public.vehicles (stock_number, make, model, year, branch_id, status, source)
  values ('', 'Toyota', 'Land Cruiser', 2021, v_branch, 'acquired', 'other')
  returning id into v_vehicle;

  -- acquisition_number is assigned by BEFORE INSERT trigger (pass empty string).
  insert into public.acquisitions (
    acquisition_number, vehicle_id, branch_id, source_type, source_name,
    purchase_price, currency, status
  )
  values (
    '', v_vehicle, v_branch, 'individual_owner', 'Test Seller',
    85000, 'AED', 'draft'
  )
  returning id, acquisition_number into v_acq, v_number;

  if v_number is null or v_number not like 'ZM-ACQ-%' then
    raise exception 'acquisition number not generated: %', v_number;
  end if;

  -- Valid transitions along the happy path to pending_approval
  update public.acquisitions set status = 'sourcing' where id = v_acq;
  update public.acquisitions set status = 'negotiating' where id = v_acq;
  update public.acquisitions set status = 'pending_approval' where id = v_acq;

  -- Invalid transition must fail
  begin
    update public.acquisitions set status = 'purchased' where id = v_acq;
    raise exception 'expected invalid transition to fail';
  exception
    when check_violation then null;
    when others then
      if sqlerrm not like '%invalid acquisition status transition%' then
        raise;
      end if;
  end;

  -- Expense + total cost (purchase price + non-purchase expenses)
  insert into public.vehicle_expenses (
    vehicle_id, acquisition_id, category, description, amount, currency, expense_date
  )
  values (v_vehicle, v_acq, 'transportation', 'Transport', 1500, 'AED', current_date)
  returning id into v_expense;

  v_total := public.acquisition_total_cost(v_acq);
  if v_total is distinct from 86500::numeric then
    raise exception 'unexpected total cost: %', v_total;
  end if;

  -- Duplicate active acquisition for same vehicle must fail
  begin
    insert into public.acquisitions (
      acquisition_number, vehicle_id, branch_id, source_type, purchase_price, status
    )
    values ('', v_vehicle, v_branch, 'dealer', 1000, 'draft');
    raise exception 'expected duplicate active acquisition to fail';
  exception
    when unique_violation then null;
  end;

  -- Linking a second inventory vehicle to a new acquisition must succeed
  -- (same flow as UI: select existing vehicle → create acquisition)
  insert into public.vehicles (stock_number, make, model, year, branch_id, status, source)
  values ('', 'Nissan', 'Patrol', 2020, v_branch, 'acquired', 'other')
  returning id into v_vehicle2;

  insert into public.acquisitions (
    acquisition_number, vehicle_id, branch_id, source_type, source_name,
    purchase_price, currency, status
  )
  values (
    '', v_vehicle2, v_branch, 'auction', 'Emirates Auction',
    120000, 'AED', 'draft'
  )
  returning id into v_acq2;

  if v_acq2 is null then
    raise exception 'failed to link existing inventory vehicle to acquisition';
  end if;

  if (
    select count(*) from public.vehicles where id in (v_vehicle, v_vehicle2)
  ) <> 2 then
    raise exception 'unexpected vehicle duplication while linking acquisitions';
  end if;

  -- Arrival date before purchase date must fail
  begin
    update public.acquisitions
    set purchase_date = '2026-05-10',
        expected_arrival_date = '2026-05-01'
    where id = v_acq;
    raise exception 'expected arrival/purchase date check to fail';
  exception
    when check_violation then null;
  end;

  raise notice 'phase6_acquisitions checks passed';
end $$;

rollback;
