-- =============================================================================
-- 00041_approve_inspection_vehicle_status.sql
-- On inspection approve, advance vehicle status from the inspection result
-- (pass → ready_for_sale again; repair/fail outcomes unchanged).
-- =============================================================================

create or replace function public.approve_inspection(
  p_inspection_id uuid,
  p_note text default null,
  p_override_critical boolean default false
)
returns public.inspections
language plpgsql
security definer
set search_path = public
as $$
declare
  v_row public.inspections%rowtype;
  v_critical int;
  v_vehicle public.vehicles%rowtype;
  v_target public.vehicle_status;
begin
  select * into v_row
  from public.inspections
  where id = p_inspection_id
  for update;

  if not found then
    raise exception 'inspection not found';
  end if;

  if not public.has_permission_for_branch('inspection.approve', v_row.branch_id) then
    raise exception 'not authorized';
  end if;

  if v_row.status is distinct from 'under_review' then
    raise exception 'inspection is not under review';
  end if;

  if not public.inspection_allows_self_approval()
     and (
       (v_row.inspected_by is not null and v_row.inspected_by = auth.uid())
       or (v_row.created_by is not null and v_row.created_by = auth.uid())
     ) then
    raise exception 'self approval is not allowed';
  end if;

  select count(*)::int into v_critical
  from public.inspection_findings f
  where f.inspection_id = p_inspection_id
    and f.severity = 'critical'
    and f.is_resolved = false;

  if v_critical > 0 then
    if not p_override_critical then
      raise exception 'unresolved critical findings (%); use override', v_critical;
    end if;
    if not public.has_permission_for_branch('inspection.override', v_row.branch_id) then
      raise exception 'inspection.override required to approve with critical findings';
    end if;
  end if;

  perform set_config(
    'app.inspection_status_reason',
    coalesce(nullif(trim(p_note), ''), 'approved'),
    true
  );

  update public.inspections
  set
    status = 'approved',
    reviewed_by = auth.uid(),
    reviewed_at = timezone('utc', now()),
    approved_at = timezone('utc', now()),
    completed_at = coalesce(completed_at, timezone('utc', now())),
    review_note = nullif(trim(coalesce(p_note, '')), ''),
    rejected_at = null,
    rejection_reason = null,
    updated_by = auth.uid()
  where id = p_inspection_id
  returning * into v_row;

  -- Sync vehicle status from the approved inspection result.
  select * into v_vehicle
  from public.vehicles
  where id = v_row.vehicle_id and deleted_at is null
  for update;

  if found then
    v_target := case
      when v_row.result in ('pass', 'pass_with_advisories') and v_critical = 0
        then 'ready_for_sale'::public.vehicle_status
      when v_row.result = 'repair_required'
        then 'under_repair'::public.vehicle_status
      when v_row.result = 'fail'
        then 'inspection_failed'::public.vehicle_status
      when v_row.result in ('pass', 'pass_with_advisories') and v_critical > 0
        then 'under_repair'::public.vehicle_status
      else null
    end;

    if v_target is not null
       and v_vehicle.status is distinct from v_target
       and public.is_valid_vehicle_status_transition(v_vehicle.status, v_target) then
      perform set_config(
        'app.vehicle_status_reason',
        'inspection approved: ' || coalesce(v_row.result::text, 'no_result'),
        true
      );
      update public.vehicles
      set
        status = v_target,
        updated_by = auth.uid()
      where id = v_vehicle.id;
    end if;
  end if;

  perform public.write_audit_log(
    'INSPECTION_APPROVED',
    'inspections',
    p_inspection_id,
    jsonb_build_object('status', 'under_review'),
    jsonb_build_object(
      'status', 'approved',
      'reviewed_by', auth.uid(),
      'result', v_row.result,
      'vehicle_status', v_target
    ),
    jsonb_build_object(
      'note', nullif(trim(coalesce(p_note, '')), ''),
      'override_critical', p_override_critical,
      'unresolved_critical', v_critical
    )
  );

  return v_row;
end;
$$;

comment on function public.approve_inspection is
  'under_review → approved; advances vehicle status (pass → ready_for_sale, repair → under_repair, fail → inspection_failed).';
