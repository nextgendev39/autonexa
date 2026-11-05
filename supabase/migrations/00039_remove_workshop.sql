-- Remove Workshop feature: drop workshop schema objects and stop requiring workshop
-- for Ready for Sale / pricing cost aggregation.
-- Does not edit historical migrations 00011 / 00032.

-- ---------------------------------------------------------------------------
-- Cost helper: workshop always contributes 0
-- ---------------------------------------------------------------------------

create or replace function public.vehicle_workshop_actual_cost(p_vehicle_id uuid)
returns numeric
language sql
stable
security definer
set search_path = public
as $$
  select 0::numeric(14, 2);
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
    where e.vehicle_id = p_vehicle_id
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

-- ---------------------------------------------------------------------------
-- Ready for Sale: workshop never required
-- ---------------------------------------------------------------------------

create or replace function public.evaluate_vehicle_ready_for_sale(p_vehicle_id uuid)
returns jsonb
language plpgsql
stable
security definer
set search_path = public
as $$
declare
  v_vehicle public.vehicles%rowtype;
  v_inspection public.inspections%rowtype;
  v_validity_days integer;
  v_inspection_at timestamptz;
  v_expired boolean := false;
  v_critical int := 0;
  v_missing_docs text[];
  v_checks jsonb := '[]'::jsonb;
  v_blockers jsonb := '[]'::jsonb;
  v_eligible boolean := true;
  v_can_override boolean := false;
  v_status_ok boolean := false;
  v_inspection_ok boolean := false;
  v_result_ok boolean := false;
  v_repairs_ok boolean := true;
  v_docs_ok boolean := true;
  v_inspection_label text := 'missing';
  v_repairs_required boolean := false;
begin
  select * into v_vehicle
  from public.vehicles
  where id = p_vehicle_id and deleted_at is null;

  if not found then
    return jsonb_build_object(
      'eligible', false,
      'error', 'vehicle_not_found',
      'blockers', jsonb_build_array(
        jsonb_build_object('code', 'not_found', 'message', 'Vehicle not found.', 'action', null)
      )
    );
  end if;

  if not public.can_access_branch(v_vehicle.branch_id) then
    return jsonb_build_object(
      'eligible', false,
      'error', 'branch_denied',
      'blockers', jsonb_build_array(
        jsonb_build_object('code', 'branch_denied', 'message', 'You do not have access to this vehicle branch.', 'action', null)
      )
    );
  end if;

  v_can_override := public.has_permission_for_branch('vehicle.ready_for_sale.override', v_vehicle.branch_id);

  v_status_ok := v_vehicle.status in ('acquired', 'under_inspection', 'under_repair');
  if not v_status_ok then
    v_eligible := false;
    v_blockers := v_blockers || jsonb_build_array(
      jsonb_build_object(
        'code', 'invalid_status',
        'message', format('Vehicle status %s cannot move to Ready for Sale.', v_vehicle.status::text),
        'action', null
      )
    );
  end if;

  select * into v_inspection
  from public.inspections i
  where i.vehicle_id = p_vehicle_id
    and i.status = 'approved'
  order by coalesce(i.approved_at, i.completed_at, i.updated_at) desc nulls last
  limit 1;

  if not found then
    v_eligible := false;
    v_inspection_ok := false;
    v_blockers := v_blockers || jsonb_build_array(
      jsonb_build_object(
        'code', 'inspection_required',
        'message', 'Inspection required. No completed inspection found.',
        'action', 'create_inspection'
      )
    );
    v_checks := v_checks || jsonb_build_array(
      jsonb_build_object('key', 'inspection_completed', 'ok', false, 'label', 'Inspection completed')
    );
  else
    v_inspection_ok := true;
    v_inspection_at := coalesce(v_inspection.approved_at, v_inspection.completed_at, v_inspection.updated_at);
    v_validity_days := public.get_inspection_validity_days();

    if v_validity_days is not null
       and v_inspection_at is not null
       and v_inspection_at < (timezone('utc', now()) - make_interval(days => v_validity_days)) then
      v_expired := true;
      v_eligible := false;
      v_inspection_ok := false;
      v_blockers := v_blockers || jsonb_build_array(
        jsonb_build_object(
          'code', 'inspection_expired',
          'message', 'Inspection has expired. A new inspection is required.',
          'action', 'create_inspection',
          'inspection_id', v_inspection.id
        )
      );
      v_inspection_label := 'expired';
    end if;

    select count(*)::int into v_critical
    from public.inspection_findings f
    where f.inspection_id = v_inspection.id
      and f.severity = 'critical'
      and f.is_resolved = false;

    if v_inspection.result in ('pass', 'pass_with_advisories') then
      v_result_ok := true;
      v_inspection_label := case
        when v_inspection.result = 'pass_with_advisories' then 'passed_with_advisories'
        else 'passed'
      end;
      v_repairs_required := false;
      v_repairs_ok := true;
    elsif v_inspection.result = 'repair_required' then
      -- Workshop removed: repair_required no longer blocks Ready for Sale.
      v_result_ok := true;
      v_inspection_label := 'pass_with_repairs';
      v_repairs_required := true;
      v_repairs_ok := true;
    elsif v_inspection.result = 'fail' then
      v_result_ok := false;
      v_eligible := false;
      v_inspection_label := 'failed';
      v_blockers := v_blockers || jsonb_build_array(
        jsonb_build_object(
          'code', 'inspection_failed',
          'message', 'Inspection result is fail. Vehicle cannot be marked Ready for Sale.',
          'action', 'view_inspection',
          'inspection_id', v_inspection.id
        )
      );
    else
      v_result_ok := false;
      v_eligible := false;
      v_blockers := v_blockers || jsonb_build_array(
        jsonb_build_object(
          'code', 'inspection_result_missing',
          'message', 'Inspection has no valid result.',
          'action', 'view_inspection',
          'inspection_id', v_inspection.id
        )
      );
    end if;

    if v_critical > 0 then
      v_eligible := false;
      v_blockers := v_blockers || jsonb_build_array(
        jsonb_build_object(
          'code', 'critical_findings',
          'message', format('%s unresolved critical inspection finding(s).', v_critical),
          'action', 'view_inspection',
          'inspection_id', v_inspection.id
        )
      );
    end if;

    v_checks := v_checks
      || jsonb_build_array(
        jsonb_build_object(
          'key', 'inspection_completed',
          'ok', v_inspection_ok and not v_expired,
          'label', 'Inspection completed'
        )
      )
      || jsonb_build_array(
        jsonb_build_object(
          'key', 'inspection_result',
          'ok', v_result_ok and not v_expired,
          'label', format('Inspection result: %s', coalesce(v_inspection.result::text, 'none'))
        )
      )
      || jsonb_build_array(
        jsonb_build_object(
          'key', 'critical_findings',
          'ok', v_critical = 0,
          'label', 'No unresolved critical findings'
        )
      );
  end if;

  v_checks := v_checks
    || jsonb_build_array(
      jsonb_build_object(
        'key', 'repairs',
        'ok', v_repairs_ok,
        'label', 'No pending repairs'
      )
    );

  select coalesce(array_agg(dt.name order by dt.name), '{}'::text[])
  into v_missing_docs
  from public.document_types dt
  where dt.is_active
    and dt.required_for_sale
    and not exists (
      select 1
      from public.documents d
      where d.entity_type = 'vehicles'
        and d.entity_id = p_vehicle_id
        and d.document_type_id = dt.id
        and d.deleted_at is null
        and d.status = 'active'
    );

  if coalesce(array_length(v_missing_docs, 1), 0) > 0 then
    v_docs_ok := false;
    v_eligible := false;
    v_blockers := v_blockers || (
      select coalesce(jsonb_agg(
        jsonb_build_object(
          'code', 'document_missing',
          'message', format('Required document missing: %s', doc_name),
          'action', 'view_documents'
        )
      ), '[]'::jsonb)
      from unnest(v_missing_docs) as doc_name
    );
  end if;

  v_checks := v_checks || jsonb_build_array(
    jsonb_build_object(
      'key', 'documents',
      'ok', v_docs_ok,
      'label', 'Documents complete'
    )
  );

  v_checks := v_checks || jsonb_build_array(
    jsonb_build_object(
      'key', 'status',
      'ok', v_status_ok,
      'label', format('Current status allows transition (%s)', v_vehicle.status::text)
    )
  );

  return jsonb_build_object(
    'eligible', v_eligible and v_status_ok,
    'canOverride', v_can_override,
    'vehicleId', v_vehicle.id,
    'stockNumber', v_vehicle.stock_number,
    'make', v_vehicle.make,
    'model', v_vehicle.model,
    'year', v_vehicle.year,
    'currentStatus', v_vehicle.status,
    'inspection', case
      when v_inspection.id is null then null
      else jsonb_build_object(
        'id', v_inspection.id,
        'inspectionNumber', v_inspection.inspection_number,
        'result', v_inspection.result,
        'approvedAt', v_inspection.approved_at,
        'completedAt', v_inspection.completed_at,
        'expired', v_expired,
        'repairsRequired', v_repairs_required
      )
    end,
    'workshop', jsonb_build_object(
      'required', false,
      'orderId', null,
      'orderNumber', null,
      'status', null,
      'qualityResult', null,
      'activeOrders', 0,
      'pendingJobs', 0
    ),
    'checks', v_checks,
    'blockers', v_blockers,
    'summary', jsonb_build_object(
      'inspection', v_inspection_label,
      'workshop', 'not_required'
    )
  );
end;
$$;

create or replace function public.mark_vehicle_ready_for_sale(
  p_vehicle_id uuid,
  p_reason text default null,
  p_override boolean default false,
  p_override_reason text default null
)
returns public.vehicles
language plpgsql
security definer
set search_path = public
as $$
declare
  v_row public.vehicles%rowtype;
  v_old_status public.vehicle_status;
  v_eval jsonb;
  v_inspection_id uuid;
  v_reason text;
begin
  select * into v_row
  from public.vehicles
  where id = p_vehicle_id and deleted_at is null
  for update;

  if not found then
    raise exception 'vehicle not found';
  end if;

  if not public.can_access_branch(v_row.branch_id) then
    raise exception 'not authorized for branch';
  end if;

  if not public.has_permission_for_branch('vehicle.ready_for_sale', v_row.branch_id) then
    raise exception 'not authorized';
  end if;

  if v_row.status = 'ready_for_sale' then
    raise exception 'vehicle is already ready for sale';
  end if;

  v_eval := public.evaluate_vehicle_ready_for_sale(p_vehicle_id);

  if p_override then
    if not public.has_permission_for_branch('vehicle.ready_for_sale.override', v_row.branch_id) then
      raise exception 'override not authorized';
    end if;
    if p_override_reason is null or length(trim(p_override_reason)) = 0 then
      raise exception 'override reason required';
    end if;
    if not public.is_valid_vehicle_status_transition(v_row.status, 'ready_for_sale') then
      raise exception 'invalid vehicle status transition from % to ready_for_sale', v_row.status;
    end if;
  else
    if coalesce((v_eval ->> 'eligible')::boolean, false) is not true then
      raise exception 'vehicle not eligible for ready_for_sale: %', v_eval -> 'blockers';
    end if;
  end if;

  v_old_status := v_row.status;
  v_inspection_id := nullif(v_eval #>> '{inspection,id}', '')::uuid;

  v_reason := coalesce(
    nullif(trim(coalesce(p_reason, '')), ''),
    case when p_override then 'ready for sale (override)' else 'marked ready for sale' end
  );

  if p_override then
    v_reason := v_reason || ' | override: ' || trim(p_override_reason);
  end if;

  perform set_config('app.vehicle_status_reason', v_reason, true);

  update public.vehicles
  set
    status = 'ready_for_sale',
    updated_by = auth.uid()
  where id = p_vehicle_id
  returning * into v_row;

  perform public.write_audit_log(
    'VEHICLE_MARKED_READY_FOR_SALE',
    'vehicles',
    p_vehicle_id,
    jsonb_build_object('status', v_old_status),
    jsonb_build_object('status', 'ready_for_sale'),
    jsonb_build_object(
      'vehicle_id', p_vehicle_id,
      'previous_status', v_old_status,
      'new_status', 'ready_for_sale',
      'inspection_id', v_inspection_id,
      'performed_by', auth.uid(),
      'reason', nullif(trim(coalesce(p_reason, '')), ''),
      'override', coalesce(p_override, false),
      'override_reason', case when p_override then trim(p_override_reason) else null end
    )
  );

  return v_row;
end;
$$;

-- ---------------------------------------------------------------------------
-- Drop workshop functions (cascade dependents such as triggers)
-- ---------------------------------------------------------------------------

drop function if exists public.create_workshop_from_inspection(uuid, uuid[], uuid, public.workshop_priority, public.workshop_type, text, boolean) cascade;
drop function if exists public.perform_workshop_quality_check(uuid, public.workshop_quality_result, text, jsonb) cascade;
drop function if exists public.perform_workshop_quality_check(uuid, public.workshop_quality_result, text) cascade;
drop function if exists public.submit_workshop_quality_check(uuid) cascade;
drop function if exists public.cancel_workshop_job(uuid, text) cascade;
drop function if exists public.resume_workshop_job(uuid) cascade;
drop function if exists public.set_workshop_job_waiting_vendor(uuid) cascade;
drop function if exists public.set_workshop_job_waiting_parts(uuid) cascade;
drop function if exists public.complete_workshop_job(uuid) cascade;
drop function if exists public.start_workshop_job(uuid) cascade;
drop function if exists public.assign_workshop_job(uuid, uuid, uuid) cascade;
drop function if exists public.bump_workshop_estimate(uuid, numeric, boolean) cascade;
drop function if exists public.cancel_workshop_order(uuid, text) cascade;
drop function if exists public.hold_workshop_order(uuid, public.workshop_hold_reason, text) cascade;
drop function if exists public.start_workshop_order(uuid) cascade;
drop function if exists public.schedule_workshop_order(uuid, date, date) cascade;
drop function if exists public.return_workshop_for_changes(uuid, text) cascade;
drop function if exists public.reject_workshop_order(uuid, text) cascade;
drop function if exists public.approve_workshop_order(uuid, text) cascade;
drop function if exists public.submit_workshop_for_approval(uuid) cascade;
drop function if exists public.read_workshop_costs(uuid) cascade;
drop function if exists public.recalculate_workshop_order_costs(uuid) cascade;
drop function if exists public.recalculate_workshop_job_actual_cost(uuid) cascade;
drop function if exists public.workshop_cost_approval_threshold() cascade;
drop function if exists public.workshop_job_labour_calc_total() cascade;
drop function if exists public.workshop_job_parts_calc_total() cascade;
drop function if exists public.workshop_jobs_assign_number() cascade;
drop function if exists public.workshop_orders_assign_number() cascade;
drop function if exists public.workshop_orders_sync_legacy_costs() cascade;
drop function if exists public.next_workshop_job_number() cascade;
drop function if exists public.next_workshop_order_number() cascade;
drop function if exists public.workshop_job_is_overdue(date, public.workshop_job_status) cascade;
drop function if exists public.workshop_order_is_overdue(date, public.workshop_status) cascade;
drop function if exists public.workshop_uae_today() cascade;
drop function if exists public.is_valid_workshop_job_status_transition(public.workshop_job_status, public.workshop_job_status) cascade;
drop function if exists public.is_valid_workshop_status_transition(public.workshop_status, public.workshop_status) cascade;

-- ---------------------------------------------------------------------------
-- Drop workshop tables (child → parent)
-- ---------------------------------------------------------------------------

drop table if exists public.workshop_photos cascade;
drop table if exists public.workshop_job_labour cascade;
drop table if exists public.workshop_job_parts cascade;
drop table if exists public.workshop_expenses cascade;
drop table if exists public.workshop_jobs cascade;
drop table if exists public.workshop_quality_checks cascade;
drop table if exists public.workshop_items cascade;
drop table if exists public.workshop_status_history cascade;
drop table if exists public.workshop_orders cascade;

drop sequence if exists public.workshop_order_number_seq cascade;
drop sequence if exists public.workshop_job_number_seq cascade;

-- ---------------------------------------------------------------------------
-- Drop workshop enums (ignore if still referenced)
-- ---------------------------------------------------------------------------

do $$
begin
  drop type if exists public.workshop_photo_category cascade;
  drop type if exists public.workshop_quality_result cascade;
  drop type if exists public.workshop_hold_reason cascade;
  drop type if exists public.workshop_expense_type cascade;
  drop type if exists public.workshop_part_status cascade;
  drop type if exists public.workshop_job_type cascade;
  drop type if exists public.workshop_job_status cascade;
  drop type if exists public.workshop_type cascade;
  drop type if exists public.workshop_priority cascade;
  drop type if exists public.workshop_status cascade;
exception
  when others then
    raise notice 'workshop enum drop skipped: %', sqlerrm;
end $$;

-- ---------------------------------------------------------------------------
-- Optional: remove workshop permissions and workshop_manager role mappings
-- ---------------------------------------------------------------------------

delete from public.role_permissions rp
using public.permissions p
where rp.permission_id = p.id
  and p.key like 'workshop.%';

delete from public.permissions
where key like 'workshop.%';

-- Keep workshop_manager role row if users may still reference it; clear its leftovers.
delete from public.role_permissions rp
using public.roles r
where rp.role_id = r.id
  and r.key = 'workshop_manager';

comment on function public.evaluate_vehicle_ready_for_sale is
  'Evaluate Ready for Sale eligibility (inspection + documents). Workshop is not required.';

comment on function public.vehicle_workshop_actual_cost is
  'Legacy cost helper retained for pricing signatures; always returns 0 after workshop removal.';
