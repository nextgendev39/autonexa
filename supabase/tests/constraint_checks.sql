-- Constraint validation for Phase 3.
-- Run against a migrated database (local or linked remote):
--   psql "$DATABASE_URL" -f supabase/tests/constraint_checks.sql
-- Or: npx supabase db execute -f supabase/tests/constraint_checks.sql (when CLI supports it)

begin;

do $$
declare
  branch_id uuid;
  vehicle_id uuid;
  customer_id uuid;
  failed text := '';
begin
  select id into branch_id from public.branches limit 1;
  if branch_id is null then
    insert into public.branches (name, code, emirate, address_line_1, city)
    values ('Test Branch', 'TST-01', 'dubai', 'Test Street', 'Dubai')
    returning id into branch_id;
  end if;

  -- VIN uniqueness (active)
  begin
    insert into public.vehicles (stock_number, vin, make, model, year, branch_id, source, status)
    values ('TST-STOCK-1', '1HGCM82633A004352', 'Toyota', 'Camry', 2020, branch_id, 'direct_purchase', 'acquired')
    returning id into vehicle_id;

    insert into public.vehicles (stock_number, vin, make, model, year, branch_id, source, status)
    values ('TST-STOCK-2', '1HGCM82633A004352', 'Toyota', 'Camry', 2021, branch_id, 'direct_purchase', 'acquired');

    failed := failed || 'VIN uniqueness did not reject duplicate; ';
  exception when unique_violation then
    null;
  end;

  -- Stock number uniqueness
  begin
    insert into public.vehicles (stock_number, make, model, year, branch_id, source, status)
    values ('TST-STOCK-1', 'Honda', 'Accord', 2019, branch_id, 'auction', 'acquired');
    failed := failed || 'Stock uniqueness did not reject duplicate; ';
  exception when unique_violation then
    null;
  end;

  -- Negative amount rejected
  begin
    insert into public.vehicle_expenses (vehicle_id, category, amount, expense_date)
    values (vehicle_id, 'repair', -10, current_date);
    failed := failed || 'Negative expense amount was accepted; ';
  exception when check_violation then
    null;
  end;

  -- Invalid enum rejected
  begin
    execute $sql$
      insert into public.vehicles (stock_number, make, model, year, branch_id, source, status)
      values ('TST-STOCK-ENUM', 'Kia', 'Sportage', 2018, $1, 'direct_purchase', 'not_a_status')
    $sql$ using branch_id;
    failed := failed || 'Invalid enum was accepted; ';
  exception when invalid_text_representation or check_violation or datatype_mismatch then
    null;
  end;

  -- Customer for reservation tests
  insert into public.customers (
    customer_code, first_name, last_name, display_name, phone, branch_id
  )
  values ('TST-CUST-1', 'Test', 'Buyer', 'Test Buyer', '+971500000001', branch_id);

  select id into customer_id from public.customers where customer_code = 'TST-CUST-1' order by created_at desc limit 1;

  -- One active reservation per vehicle
  begin
    insert into public.reservations (
      reservation_number, vehicle_id, customer_id, branch_id, amount, status, expires_at
    )
    values (
      'TST-RES-1', vehicle_id, customer_id, branch_id, 1000, 'active', timezone('utc', now()) + interval '3 days'
    );

    insert into public.reservations (
      reservation_number, vehicle_id, customer_id, branch_id, amount, status, expires_at
    )
    values (
      'TST-RES-2', vehicle_id, customer_id, branch_id, 1000, 'active', timezone('utc', now()) + interval '3 days'
    );

    failed := failed || 'Duplicate active reservation was accepted; ';
  exception when unique_violation then
    null;
  end;

  -- Invalid foreign key rejected
  begin
    insert into public.vehicles (stock_number, make, model, year, branch_id, source, status)
    values ('TST-STOCK-FK', 'Nissan', 'Altima', 2017, '00000000-0000-0000-0000-000000000000', 'other', 'acquired');
    failed := failed || 'Invalid branch foreign key was accepted; ';
  exception when foreign_key_violation then
    null;
  end;

  if failed <> '' then
    raise exception 'Constraint checks failed: %', failed;
  end if;

  raise notice 'All Phase 3 constraint checks passed';
end $$;

rollback;
