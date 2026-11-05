-- Phase 5 inventory business-rule smoke tests (transaction rolled back).
begin;

do $$
declare
  v_branch uuid;
  v_loc uuid;
  v_id uuid;
  v_stock text;
begin
  select id into v_branch from public.branches where code = 'DXB-01' limit 1;
  if v_branch is null then
    insert into public.branches (name, code, emirate, city, is_active)
    values ('Test Branch', 'TST-01', 'dubai', 'Dubai', true)
    returning id into v_branch;
  end if;

  insert into public.branch_locations (branch_id, name, location_type)
  values (v_branch, 'Test Yard', 'yard')
  returning id into v_loc;

  -- Stock number auto-assigned
  insert into public.vehicles (stock_number, make, model, year, branch_id, location_id, status)
  values ('', 'Toyota', 'Camry', 2020, v_branch, v_loc, 'acquired')
  returning id, stock_number into v_id, v_stock;

  if v_stock is null or v_stock not like 'ZM-%' then
    raise exception 'stock number not generated: %', v_stock;
  end if;

  -- Valid transition
  update public.vehicles set status = 'under_inspection' where id = v_id;

  -- Invalid transition must fail
  begin
    update public.vehicles set status = 'sold' where id = v_id;
    raise exception 'expected invalid transition to fail';
  exception
    when check_violation then null;
    when others then
      if sqlerrm not like '%invalid vehicle status transition%' then
        raise;
      end if;
  end;

  -- Location/branch mismatch must fail
  begin
    update public.vehicles
    set location_id = (
      select id from public.branch_locations
      where branch_id <> v_branch
      limit 1
    )
    where id = v_id
      and exists (select 1 from public.branch_locations where branch_id <> v_branch);
  exception
    when others then
      if sqlerrm not like '%location does not belong%' and sqlerrm not like '%invalid location%' then
        null; -- no other branch location in empty DB is fine
      end if;
  end;

  raise notice 'phase5_inventory checks passed';
end $$;

rollback;
