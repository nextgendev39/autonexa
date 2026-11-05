-- Phase 8 workshop business-rule smoke tests (transaction rolled back).
-- Prerequisite: apply supabase/migrations/00032_phase8_workshop.sql
begin;

do $$
declare
  v_branch uuid;
  v_vehicle uuid;
  v_order uuid;
  v_number text;
  v_job uuid;
begin
  if not exists (
    select 1
    from information_schema.columns
    where table_schema = 'public'
      and table_name = 'workshop_orders'
      and column_name = 'workshop_order_number'
  ) then
    raise exception
      'Phase 8 migration not applied: workshop_order_number missing. Run npm run db:reset or db push first.';
  end if;

  select id into v_branch from public.branches where code = 'DXB-01' limit 1;
  if v_branch is null then
    insert into public.branches (name, code, emirate, city, is_active)
    values ('Test Branch', 'TST-WO', 'dubai', 'Dubai', true)
    returning id into v_branch;
  end if;

  insert into public.vehicles (stock_number, make, model, year, branch_id, status, source)
  values ('', 'Nissan', 'Patrol', 2020, v_branch, 'under_repair', 'other')
  returning id into v_vehicle;

  insert into public.workshop_orders (
    workshop_order_number, job_number, vehicle_id, branch_id, status, priority, workshop_type
  )
  values ('', '', v_vehicle, v_branch, 'draft', 'normal', 'internal')
  returning id, workshop_order_number into v_order, v_number;

  if v_number is null or v_number not like 'ZM-WO-%' then
    raise exception 'workshop order number not generated: %', v_number;
  end if;

  insert into public.workshop_jobs (
    workshop_order_id, job_number, job_type, title, status, priority, estimated_cost
  )
  values (v_order, '', 'brakes', 'Replace brake pads', 'pending', 'high', 850)
  returning id into v_job;

  -- Happy-path order transitions
  update public.workshop_orders set status = 'pending_approval' where id = v_order;
  update public.workshop_orders set status = 'approved' where id = v_order;
  update public.workshop_orders set status = 'scheduled' where id = v_order;
  update public.workshop_orders set status = 'in_progress' where id = v_order;

  -- Invalid transition must fail
  begin
    update public.workshop_orders set status = 'draft' where id = v_order;
    raise exception 'expected invalid workshop transition to fail';
  exception
    when others then
      if sqlerrm not like '%invalid workshop status transition%' then
        raise;
      end if;
  end;

  -- Job transitions
  update public.workshop_jobs set status = 'assigned' where id = v_job;
  update public.workshop_jobs set status = 'in_progress' where id = v_job;

  insert into public.workshop_job_parts (
    workshop_job_id, part_name, quantity, unit_cost, status
  ) values (v_job, 'Brake pad set', 1, 450, 'used');

  insert into public.workshop_job_labour (
    workshop_job_id, description, hours, hourly_rate
  ) values (v_job, 'Pad replacement', 2, 100);

  perform public.recalculate_workshop_order_costs(v_order);

  if (
    select actual_total_cost from public.workshop_orders where id = v_order
  ) < 650 then
    raise exception 'actual cost aggregation failed';
  end if;

  update public.workshop_jobs set status = 'completed' where id = v_job;
  update public.workshop_orders set status = 'quality_check' where id = v_order;
  update public.workshop_orders set status = 'completed', cost_locked = true where id = v_order;

  raise notice 'phase8 workshop smoke tests passed';
end $$;

rollback;
