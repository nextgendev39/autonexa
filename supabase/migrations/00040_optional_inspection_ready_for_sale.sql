-- =============================================================================
-- 00040_optional_inspection_ready_for_sale.sql
-- Simplified lifecycle: create → ready_for_sale; inspection optional;
-- same user may approve inspection; NEW/USED market type.
-- =============================================================================

-- ---------------------------------------------------------------------------
-- NEW / USED (vehicle market type)
-- Does not replace vehicles.condition (excellent/good/fair/poor).
-- ---------------------------------------------------------------------------

do $$
begin
  if not exists (select 1 from pg_type where typname = 'vehicle_market_type') then
    create type public.vehicle_market_type as enum ('new', 'used');
  end if;
end
$$;

alter table public.vehicles
  add column if not exists market_type public.vehicle_market_type not null default 'used';

comment on column public.vehicles.market_type is
  'Sale condition: new or used. Independent of vehicles.condition (cosmetic grade).';

create index if not exists vehicles_market_type_idx
  on public.vehicles (market_type)
  where deleted_at is null;

-- ---------------------------------------------------------------------------
-- Same inspector may approve
-- ---------------------------------------------------------------------------

create or replace function public.inspection_allows_self_approval()
returns boolean
language sql
stable
as $$
  select true;
$$;

comment on function public.inspection_allows_self_approval is
  'When true, the inspector (or creator) may approve their own inspection.';

-- ---------------------------------------------------------------------------
-- Ready for Sale: inspection is optional (informational checks only).
-- Documents remain required for the Mark Ready for Sale action on legacy
-- acquired / under_inspection / under_repair vehicles.
-- New inventory creates set status = ready_for_sale directly in the app.
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

  -- Latest approved inspection (optional — never blocks eligibility).
  select * into v_inspection
  from public.inspections i
  where i.vehicle_id = p_vehicle_id
    and i.status = 'approved'
  order by coalesce(i.approved_at, i.completed_at, i.updated_at) desc nulls last
  limit 1;

  if not found then
    v_inspection_label := 'missing';
    v_checks := v_checks || jsonb_build_array(
      jsonb_build_object(
        'key', 'inspection_completed',
        'ok', true,
        'label', 'Inspection optional (not performed)'
      )
    );
  else
    v_inspection_at := coalesce(v_inspection.approved_at, v_inspection.completed_at, v_inspection.updated_at);
    v_validity_days := public.get_inspection_validity_days();

    if v_validity_days is not null
       and v_inspection_at is not null
       and v_inspection_at < (timezone('utc', now()) - make_interval(days => v_validity_days)) then
      v_expired := true;
      v_inspection_label := 'expired';
    end if;

    select count(*)::int into v_critical
    from public.inspection_findings f
    where f.inspection_id = v_inspection.id
      and f.severity = 'critical'
      and f.is_resolved = false;

    if v_inspection.result in ('pass', 'pass_with_advisories') then
      v_inspection_label := case
        when v_inspection.result = 'pass_with_advisories' then 'passed_with_advisories'
        else 'passed'
      end;
      v_repairs_required := false;
    elsif v_inspection.result = 'repair_required' then
      v_inspection_label := 'pass_with_repairs';
      v_repairs_required := true;
    elsif v_inspection.result = 'fail' then
      v_inspection_label := 'failed';
    else
      v_inspection_label := 'missing';
    end if;

    v_checks := v_checks
      || jsonb_build_array(
        jsonb_build_object(
          'key', 'inspection_completed',
          'ok', not v_expired,
          'label', 'Inspection completed (optional)'
        )
      )
      || jsonb_build_array(
        jsonb_build_object(
          'key', 'inspection_result',
          'ok', true,
          'label', format('Inspection result: %s', coalesce(v_inspection.result::text, 'none'))
        )
      )
      || jsonb_build_array(
        jsonb_build_object(
          'key', 'critical_findings',
          'ok', v_critical = 0,
          'label', format('Unresolved critical findings: %s', v_critical)
        )
      );
  end if;

  v_checks := v_checks || jsonb_build_array(
    jsonb_build_object(
      'key', 'repairs',
      'ok', true,
      'label', 'Workshop not required'
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

comment on function public.evaluate_vehicle_ready_for_sale is
  'Eligibility for Mark Ready for Sale. Inspection is optional and never blocks; workshop is not required.';
