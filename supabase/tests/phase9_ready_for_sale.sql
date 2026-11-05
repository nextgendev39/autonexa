-- Ready for Sale eligibility and transition smoke tests (transaction rolled back).
begin;

do $$
declare
  v_branch uuid;
  v_loc uuid;
  v_vehicle uuid;
  v_eval jsonb;
  v_keys text[];
begin
  select id into v_branch from public.branches where code = 'DXB-01' limit 1;
  if v_branch is null then
    insert into public.branches (name, code, emirate, city, is_active)
    values ('Test Branch RFS', 'TST-RFS', 'dubai', 'Dubai', true)
    returning id into v_branch;
  end if;

  insert into public.branch_locations (branch_id, name, location_type)
  values (v_branch, 'RFS Yard', 'yard')
  returning id into v_loc;

  insert into public.vehicles (stock_number, make, model, year, branch_id, location_id, status)
  values ('', 'Toyota', 'Camry', 2022, v_branch, v_loc, 'under_inspection')
  returning id into v_vehicle;

  -- Only documents and status are checked (00063).
  v_eval := public.evaluate_vehicle_ready_for_sale(v_vehicle);
  select array_agg(c ->> 'key' order by c ->> 'key') into v_keys
  from jsonb_array_elements(v_eval -> 'checks') c;
  if v_keys is distinct from array['documents', 'status'] then
    raise exception 'expected documents and status checks only: %', v_eval;
  end if;

  -- Status outside acquired / under_inspection / under_repair → blocked
  update public.vehicles set status = 'ready_for_sale' where id = v_vehicle;
  v_eval := public.evaluate_vehicle_ready_for_sale(v_vehicle);
  if coalesce((v_eval ->> 'eligible')::boolean, true) then
    raise exception 'expected blocked for ready_for_sale status: %', v_eval;
  end if;
  if not exists (
    select 1 from jsonb_array_elements(v_eval -> 'blockers') b where b ->> 'code' = 'invalid_status'
  ) then
    raise exception 'expected invalid_status blocker: %', v_eval;
  end if;

  -- acquired → ready_for_sale is a valid transition map entry
  if not public.is_valid_vehicle_status_transition('acquired', 'ready_for_sale') then
    raise exception 'acquired → ready_for_sale should be valid';
  end if;

  if public.is_valid_vehicle_status_transition('sold', 'ready_for_sale') then
    raise exception 'sold → ready_for_sale must remain invalid';
  end if;

  raise notice 'ready_for_sale checks passed';
end $$;

rollback;
