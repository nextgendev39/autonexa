-- =============================================================================
-- 00043_update_outcome_vehicle_status.sql
-- Allow explicit vehicle status when updating an approved inspection outcome.
-- =============================================================================

drop function if exists public.update_approved_inspection_outcome(uuid, public.inspection_result, text, boolean);

create or replace function public.update_approved_inspection_outcome(
  p_inspection_id uuid,
  p_result public.inspection_result,
  p_note text default null,
  p_override_critical boolean default false,
  p_vehicle_status public.vehicle_status default null
)
returns public.inspections
language plpgsql
security definer
set search_path = public
as $$
declare
  v_row public.inspections%rowtype;
  v_previous_result public.inspection_result;
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

  if v_row.status is distinct from 'approved' then
    raise exception 'inspection is not approved';
  end if;

  if p_result is null then
    raise exception 'result required';
  end if;

  select count(*)::int into v_critical
  from public.inspection_findings f
  where f.inspection_id = p_inspection_id
    and f.severity = 'critical'
    and f.is_resolved = false;

  if p_result in ('pass', 'pass_with_advisories') and v_critical > 0 then
    if not p_override_critical then
      raise exception 'unresolved critical findings (%); use override', v_critical;
    end if;
    if not public.has_permission_for_branch('inspection.override', v_row.branch_id) then
      raise exception 'inspection.override required to pass with critical findings';
    end if;
  end if;

  v_previous_result := v_row.result;

  update public.inspections
  set
    result = p_result,
    review_note = coalesce(nullif(trim(coalesce(p_note, '')), ''), review_note),
    reviewed_by = auth.uid(),
    reviewed_at = timezone('utc', now()),
    updated_by = auth.uid()
  where id = p_inspection_id
  returning * into v_row;

  select * into v_vehicle
  from public.vehicles
  where id = v_row.vehicle_id and deleted_at is null
  for update;

  if found then
    v_target := coalesce(
      p_vehicle_status,
      case
        when p_result in ('pass', 'pass_with_advisories') and v_critical = 0
          then 'ready_for_sale'::public.vehicle_status
        when p_result in ('pass', 'pass_with_advisories') and v_critical > 0
          then 'under_repair'::public.vehicle_status
        when p_result = 'repair_required'
          then 'under_repair'::public.vehicle_status
        when p_result = 'fail'
          then 'inspection_failed'::public.vehicle_status
        else null
      end
    );

    if v_target is not null
       and v_vehicle.status is distinct from v_target
       and public.is_valid_vehicle_status_transition(v_vehicle.status, v_target) then
      perform set_config(
        'app.vehicle_status_reason',
        'inspection outcome updated: ' || p_result::text,
        true
      );
      update public.vehicles
      set
        status = v_target,
        updated_by = auth.uid()
      where id = v_vehicle.id;
    elsif v_target is not null
          and v_vehicle.status is distinct from v_target
          and not public.is_valid_vehicle_status_transition(v_vehicle.status, v_target) then
      raise exception 'invalid vehicle status transition from % to %', v_vehicle.status, v_target;
    end if;
  end if;

  perform public.write_audit_log(
    'INSPECTION_OUTCOME_UPDATED',
    'inspections',
    p_inspection_id,
    jsonb_build_object(
      'status', 'approved',
      'result', v_previous_result
    ),
    jsonb_build_object(
      'status', 'approved',
      'result', p_result,
      'reviewed_by', auth.uid(),
      'vehicle_status', v_target
    ),
    jsonb_build_object(
      'note', nullif(trim(coalesce(p_note, '')), ''),
      'override_critical', p_override_critical,
      'unresolved_critical', v_critical,
      'requested_vehicle_status', p_vehicle_status
    )
  );

  return v_row;
end;
$$;

comment on function public.update_approved_inspection_outcome is
  'Update approved inspection result and vehicle status together.';

revoke all on function public.update_approved_inspection_outcome(uuid, public.inspection_result, text, boolean, public.vehicle_status) from public;
grant execute on function public.update_approved_inspection_outcome(uuid, public.inspection_result, text, boolean, public.vehicle_status) to authenticated, service_role;
