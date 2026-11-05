-- Phase: controlled Mark Ready for Sale workflow.
-- Workshop/Aqua Station is optional unless repairs are outstanding.
-- Inspection approve + workshop QC no longer auto-advance to ready_for_sale.

-- ---------------------------------------------------------------------------
-- Config: inspection validity (null / absent = no expiry)
-- ---------------------------------------------------------------------------

create table if not exists public.system_settings (
  key text primary key,
  value jsonb not null default 'null'::jsonb,
  description text,
  updated_by uuid references public.profiles (id) on delete set null,
  created_at timestamptz not null default timezone('utc', now()),
  updated_at timestamptz not null default timezone('utc', now()),
  constraint system_settings_key_not_blank check (length(trim(key)) > 0)
);

drop trigger if exists system_settings_set_updated_at on public.system_settings;
create trigger system_settings_set_updated_at
before update on public.system_settings
for each row execute function public.set_updated_at();

alter table public.system_settings enable row level security;

drop policy if exists system_settings_select on public.system_settings;
create policy "system_settings_select"
  on public.system_settings for select to authenticated
  using (true);

drop policy if exists system_settings_manage on public.system_settings;
create policy "system_settings_manage"
  on public.system_settings for all to authenticated
  using (public.has_permission('settings.manage'))
  with check (public.has_permission('settings.manage'));

insert into public.system_settings (key, value, description)
values (
  'inspection.validity_days',
  'null'::jsonb,
  'Number of days an approved inspection remains valid for Ready for Sale. null = no expiry.'
)
on conflict (key) do nothing;

grant select on public.system_settings to authenticated;
grant select, insert, update, delete on public.system_settings to service_role;

-- ---------------------------------------------------------------------------
-- Optional mandatory documents for sale readiness (no hardcoded list)
-- ---------------------------------------------------------------------------

alter table public.document_types
  add column if not exists required_for_sale boolean not null default false;

comment on column public.document_types.required_for_sale is
  'When true, an active document of this type must exist on the vehicle before Ready for Sale.';

-- ---------------------------------------------------------------------------
-- Allow acquired → ready_for_sale (gated by mark_vehicle_ready_for_sale RPC)
-- ---------------------------------------------------------------------------

create or replace function public.is_valid_vehicle_status_transition(
  p_from public.vehicle_status,
  p_to public.vehicle_status
)
returns boolean
language sql
immutable
as $$
  select case
    when p_from is null then true
    when p_from = p_to then true
    when p_from = 'acquired' and p_to in ('under_inspection', 'ready_for_sale') then true
    when p_from = 'under_inspection' and p_to in ('ready_for_sale', 'under_repair', 'inspection_failed') then true
    when p_from = 'inspection_failed' and p_to in ('under_repair', 'under_inspection', 'archived') then true
    when p_from = 'under_repair' and p_to in ('under_inspection', 'ready_for_sale') then true
    when p_from = 'ready_for_sale' and p_to in ('reserved', 'sold', 'under_repair') then true
    when p_from = 'reserved' and p_to in ('sold', 'ready_for_sale') then true
    when p_from = 'sold' and p_to = 'delivered' then true
    when p_from = 'delivered' and p_to = 'returned' then true
    when p_from = 'returned' and p_to in ('under_inspection', 'archived') then true
    when p_to = 'archived' and p_from not in ('sold', 'delivered', 'archived') then true
    else false
  end;
$$;

-- Generic status change must not bypass Ready for Sale eligibility
-- (reserved → ready_for_sale / unreserve remains allowed).
create or replace function public.change_vehicle_status(
  p_vehicle_id uuid,
  p_new_status public.vehicle_status,
  p_reason text default null
)
returns public.vehicles
language plpgsql
security definer
set search_path = public
as $$
declare
  v_row public.vehicles%rowtype;
begin
  select * into v_row
  from public.vehicles
  where id = p_vehicle_id and deleted_at is null
  for update;

  if not found then
    raise exception 'vehicle not found';
  end if;

  if not public.has_permission_for_branch('vehicle.status.change', v_row.branch_id)
     and not public.has_permission_for_branch('vehicle.edit', v_row.branch_id) then
    raise exception 'not authorized';
  end if;

  if p_new_status = 'ready_for_sale' and v_row.status is distinct from 'reserved' then
    raise exception 'use mark_vehicle_ready_for_sale for Ready for Sale transitions';
  end if;

  if p_reason is null or length(trim(p_reason)) = 0 then
    raise exception 'reason required';
  end if;

  perform set_config('app.vehicle_status_reason', trim(p_reason), true);

  update public.vehicles
  set
    status = p_new_status,
    updated_by = auth.uid()
  where id = p_vehicle_id
  returning * into v_row;

  return v_row;
end;
$$;

-- ---------------------------------------------------------------------------
-- Inspection approve: pass no longer auto-advances to ready_for_sale
-- ---------------------------------------------------------------------------

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

  -- Vehicle status outcome based on overall result.
  -- Pass stays under_inspection — Ready for Sale is a separate controlled action.
  select * into v_vehicle
  from public.vehicles
  where id = v_row.vehicle_id and deleted_at is null
  for update;

  if found and v_vehicle.status = 'under_inspection' then
    v_target := case
      when v_row.result = 'repair_required'
        then 'under_repair'::public.vehicle_status
      when v_row.result = 'fail'
        then 'inspection_failed'::public.vehicle_status
      when v_row.result in ('pass', 'pass_with_advisories') and v_critical > 0
        then 'under_repair'::public.vehicle_status
      else null
    end;

    if v_target is not null
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
  'under_review → approved; may advance vehicle to under_repair / inspection_failed. Ready for Sale is via mark_vehicle_ready_for_sale.';

-- ---------------------------------------------------------------------------
-- Workshop QC pass: complete order but do not auto ready_for_sale
-- ---------------------------------------------------------------------------

create or replace function public.perform_workshop_quality_check(
  p_order_id uuid,
  p_result public.workshop_quality_result,
  p_notes text default null,
  p_checklist jsonb default '{}'::jsonb
)
returns public.workshop_orders
language plpgsql
security definer
set search_path = public
as $$
declare
  v_row public.workshop_orders%rowtype;
  v_critical int;
begin
  select * into v_row from public.workshop_orders where id = p_order_id for update;
  if not found then raise exception 'workshop order not found'; end if;
  if not public.has_permission_for_branch('workshop.quality_check', v_row.branch_id) then
    raise exception 'not authorized';
  end if;
  if v_row.status is distinct from 'quality_check' then
    raise exception 'workshop order is not in quality check';
  end if;
  if v_row.completed_by is not null and v_row.completed_by = auth.uid() then
    raise exception 'self approval is not allowed';
  end if;

  insert into public.workshop_quality_checks (
    workshop_order_id, result, notes, checklist, performed_by
  ) values (
    p_order_id, p_result, nullif(trim(coalesce(p_notes, '')), ''),
    coalesce(p_checklist, '{}'::jsonb), auth.uid()
  );

  if p_result = 'pass' then
    select count(*)::int into v_critical
    from public.inspection_findings f
    where f.inspection_id = v_row.source_inspection_id
      and f.severity = 'critical'
      and f.is_resolved = false;

    if v_critical > 0 then
      raise exception 'unresolved critical findings (%)', v_critical;
    end if;

    perform set_config('app.workshop_status_reason', coalesce(nullif(trim(p_notes), ''), 'quality passed'), true);
    update public.workshop_orders
    set status = 'completed',
        quality_result = p_result,
        quality_notes = nullif(trim(coalesce(p_notes, '')), ''),
        quality_checked_by = auth.uid(),
        quality_checked_at = timezone('utc', now()),
        completed_by = coalesce(completed_by, auth.uid()),
        actual_completion_date = coalesce(actual_completion_date, timezone('utc', now())),
        cost_locked = true,
        updated_by = auth.uid()
    where id = p_order_id
    returning * into v_row;

    -- Vehicle stays under_repair until mark_vehicle_ready_for_sale.

    perform public.write_audit_log(
      'WORKSHOP_QUALITY_CHECK_APPROVED', 'workshop_orders', p_order_id,
      jsonb_build_object('status', 'quality_check'),
      jsonb_build_object('status', 'completed', 'quality_result', p_result),
      jsonb_build_object('notes', nullif(trim(coalesce(p_notes, '')), ''))
    );
  else
    perform set_config('app.workshop_status_reason', coalesce(nullif(trim(p_notes), ''), 'quality rework'), true);
    update public.workshop_orders
    set status = 'in_progress',
        quality_result = p_result,
        quality_notes = nullif(trim(coalesce(p_notes, '')), ''),
        quality_checked_by = auth.uid(),
        quality_checked_at = timezone('utc', now()),
        updated_by = auth.uid()
    where id = p_order_id
    returning * into v_row;

    perform public.write_audit_log(
      'WORKSHOP_QUALITY_CHECK_REJECTED', 'workshop_orders', p_order_id,
      jsonb_build_object('status', 'quality_check'),
      jsonb_build_object('status', 'in_progress', 'quality_result', p_result),
      jsonb_build_object('notes', nullif(trim(coalesce(p_notes, '')), ''))
    );
  end if;

  return v_row;
end;
$$;

comment on function public.perform_workshop_quality_check is
  'Quality gate. PASS completes the order and locks costs; Ready for Sale remains a separate controlled action.';

-- ---------------------------------------------------------------------------
-- Eligibility evaluation (shared by GET preview + mark RPC)
-- ---------------------------------------------------------------------------

create or replace function public.get_inspection_validity_days()
returns integer
language plpgsql
stable
security definer
set search_path = public
as $$
declare
  v_raw jsonb;
  v_days integer;
begin
  select value into v_raw
  from public.system_settings
  where key = 'inspection.validity_days';

  if v_raw is null or v_raw = 'null'::jsonb then
    return null;
  end if;

  begin
    v_days := (v_raw #>> '{}')::integer;
  exception when others then
    return null;
  end;

  if v_days is null or v_days <= 0 then
    return null;
  end if;

  return v_days;
end;
$$;

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
  v_pending_repair_titles text[];
  v_active_orders int := 0;
  v_pending_jobs int := 0;
  v_workshop_required boolean := false;
  v_latest_order public.workshop_orders%rowtype;
  v_qc_ok boolean := true;
  v_missing_docs text[];
  v_checks jsonb := '[]'::jsonb;
  v_blockers jsonb := '[]'::jsonb;
  v_eligible boolean := true;
  v_can_override boolean := false;
  v_status_ok boolean := false;
  v_inspection_ok boolean := false;
  v_result_ok boolean := false;
  v_repairs_ok boolean := true;
  v_workshop_ok boolean := true;
  v_docs_ok boolean := true;
  v_inspection_label text := 'missing';
  v_workshop_label text := 'not_required';
  v_has_order boolean := false;
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

  -- Latest approved inspection
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

    select coalesce(array_agg(f.title order by f.created_at), '{}'::text[])
    into v_pending_repair_titles
    from public.inspection_findings f
    where f.inspection_id = v_inspection.id
      and f.is_resolved = false
      and (
        f.recommendation in ('repair_before_sale', 'repair_urgently', 'replace')
        or f.severity in ('major', 'critical')
        or v_inspection.result = 'repair_required'
      );

    -- Workshop is required when inspection explicitly needs repairs.
    -- Finding.is_resolved is NOT required after workshop QC — jobs/QC are the gate.
    if v_inspection.result in ('pass', 'pass_with_advisories') then
      v_result_ok := true;
      v_inspection_label := case
        when v_inspection.result = 'pass_with_advisories' then 'passed_with_advisories'
        else 'passed'
      end;
      v_workshop_required := false;
      v_repairs_ok := true;
    elsif v_inspection.result = 'repair_required' then
      v_result_ok := true;
      v_inspection_label := 'pass_with_repairs';
      v_workshop_required := true;
      -- Repairs considered OK only once workshop + QC pass (evaluated below).
      v_repairs_ok := false;
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

  -- Workshop / jobs / QC
  select count(*)::int into v_active_orders
  from public.workshop_orders o
  where o.vehicle_id = p_vehicle_id
    and o.status not in ('completed', 'cancelled');

  select count(*)::int into v_pending_jobs
  from public.workshop_jobs j
  join public.workshop_orders o on o.id = j.workshop_order_id
  where o.vehicle_id = p_vehicle_id
    and o.status <> 'cancelled'
    and j.status not in ('completed', 'cancelled');

  select * into v_latest_order
  from public.workshop_orders o
  where o.vehicle_id = p_vehicle_id
    and o.status <> 'cancelled'
  order by
    case when o.status = 'completed' then 0 else 1 end,
    coalesce(o.actual_completion_date, o.updated_at, o.created_at) desc nulls last
  limit 1;
  v_has_order := found;

  if v_workshop_required then
    if not v_has_order then
      v_workshop_ok := false;
      v_eligible := false;
        v_workshop_label := 'required';
      v_blockers := v_blockers || jsonb_build_array(
        jsonb_build_object(
          'code', 'workshop_required',
          'message', 'Repairs required. Create a workshop order.',
          'action', 'create_workshop',
          'inspection_id', v_inspection.id
        )
      );
      if coalesce(array_length(v_pending_repair_titles, 1), 0) > 0 then
        v_blockers := v_blockers || (
          select coalesce(jsonb_agg(
            jsonb_build_object(
              'code', 'repair_pending',
              'message', format('%s is still pending', title),
              'action', 'create_workshop'
            )
          ), '[]'::jsonb)
          from unnest(v_pending_repair_titles) as title
        );
      end if;
    elsif v_latest_order.status is distinct from 'completed'
          or v_latest_order.quality_result is distinct from 'pass'
          or v_active_orders > 0
          or v_pending_jobs > 0 then
      v_workshop_ok := false;
      v_eligible := false;
      v_workshop_label := 'pending';

      if v_pending_jobs > 0 or v_active_orders > 0 then
        v_blockers := v_blockers || jsonb_build_array(
          jsonb_build_object(
            'code', 'workshop_pending',
            'message', 'Workshop repair pending.',
            'action', 'view_workshop',
            'workshop_order_id', v_latest_order.id
          )
        );
        if coalesce(array_length(v_pending_repair_titles, 1), 0) > 0 then
          v_blockers := v_blockers || (
            select coalesce(jsonb_agg(
              jsonb_build_object(
                'code', 'repair_pending',
                'message', format('%s is still pending', title),
                'action', 'view_workshop',
                'workshop_order_id', v_latest_order.id
              )
            ), '[]'::jsonb)
            from unnest(v_pending_repair_titles) as title
          );
        end if;
      end if;

      if v_latest_order.status = 'quality_check'
         or (v_latest_order.status = 'completed' and v_latest_order.quality_result is distinct from 'pass') then
        v_qc_ok := false;
        v_blockers := v_blockers || jsonb_build_array(
          jsonb_build_object(
            'code', 'quality_check_pending',
            'message', 'Quality check has not been completed.',
            'action', 'complete_quality_check',
            'workshop_order_id', v_latest_order.id
          )
        );
      elsif v_latest_order.quality_result in ('fail', 'requires_rework') then
        v_qc_ok := false;
        v_blockers := v_blockers || jsonb_build_array(
          jsonb_build_object(
            'code', 'quality_check_failed',
            'message', 'Quality check did not pass.',
            'action', 'complete_quality_check',
            'workshop_order_id', v_latest_order.id
          )
        );
      end if;
    else
      v_workshop_label := 'completed';
      v_qc_ok := true;
      v_repairs_ok := true;
    end if;
  else
    -- Workshop not required by inspection — still block if open work exists
    if v_active_orders > 0 or v_pending_jobs > 0 then
      v_workshop_ok := false;
      v_eligible := false;
      v_workshop_label := 'pending';
      v_blockers := v_blockers || jsonb_build_array(
        jsonb_build_object(
          'code', 'workshop_pending',
          'message', 'Workshop work is still pending.',
          'action', 'view_workshop',
          'workshop_order_id', v_latest_order.id
        )
      );
    elsif v_has_order and v_latest_order.status = 'completed' then
      -- Refurbishment occurred — require QC pass when a completed order exists
      if v_latest_order.quality_result is distinct from 'pass' then
        v_workshop_ok := false;
        v_qc_ok := false;
        v_eligible := false;
        v_workshop_label := 'quality_check_pending';
        v_blockers := v_blockers || jsonb_build_array(
          jsonb_build_object(
            'code', 'quality_check_pending',
            'message', 'Quality check has not been completed.',
            'action', 'complete_quality_check',
            'workshop_order_id', v_latest_order.id
          )
        );
      else
        v_workshop_label := 'completed';
      end if;
    else
      v_workshop_label := 'not_required';
    end if;
  end if;

  v_checks := v_checks
    || jsonb_build_array(
      jsonb_build_object(
        'key', 'repairs',
        'ok', v_repairs_ok,
        'label', 'No pending repairs'
      )
    )
    || jsonb_build_array(
      jsonb_build_object(
        'key', 'workshop',
        'ok', v_workshop_ok,
        'label', case when v_workshop_required then 'Workshop completed' else 'No pending repairs / workshop' end
      )
    )
    || jsonb_build_array(
      jsonb_build_object(
        'key', 'quality_check',
        'ok', v_qc_ok,
        'label', case
          when v_workshop_required or (v_has_order and v_latest_order.status = 'completed')
            then 'Quality check passed'
          else 'Quality check not required'
        end
      )
    );

  -- Mandatory documents (configured only)
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

  if not v_eligible then
    null;
  end if;

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
        'repairsRequired', v_workshop_required
      )
    end,
    'workshop', jsonb_build_object(
      'required', v_workshop_required,
      'orderId', v_latest_order.id,
      'orderNumber', v_latest_order.workshop_order_number,
      'status', v_latest_order.status,
      'qualityResult', v_latest_order.quality_result,
      'activeOrders', v_active_orders,
      'pendingJobs', v_pending_jobs
    ),
    'checks', v_checks,
    'blockers', v_blockers,
    'summary', jsonb_build_object(
      'inspection', v_inspection_label,
      'workshop', v_workshop_label
    )
  );
end;
$$;

-- ---------------------------------------------------------------------------
-- Mark Ready for Sale (atomic)
-- ---------------------------------------------------------------------------

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
  v_workshop_order_id uuid;
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
  v_workshop_order_id := nullif(v_eval #>> '{workshop,orderId}', '')::uuid;

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
      'workshop_order_id', v_workshop_order_id,
      'performed_by', auth.uid(),
      'reason', nullif(trim(coalesce(p_reason, '')), ''),
      'override', coalesce(p_override, false),
      'override_reason', case when p_override then trim(p_override_reason) else null end
    )
  );

  return v_row;
end;
$$;

revoke all on function public.get_inspection_validity_days() from public;
revoke all on function public.evaluate_vehicle_ready_for_sale(uuid) from public;
revoke all on function public.mark_vehicle_ready_for_sale(uuid, text, boolean, text) from public;

grant execute on function public.get_inspection_validity_days() to authenticated, service_role;
grant execute on function public.evaluate_vehicle_ready_for_sale(uuid) to authenticated, service_role;
grant execute on function public.mark_vehicle_ready_for_sale(uuid, text, boolean, text) to authenticated, service_role;

-- ---------------------------------------------------------------------------
-- Permissions
-- ---------------------------------------------------------------------------

insert into public.permissions (key, name, module, description)
values
  (
    'vehicle.ready_for_sale',
    'Mark vehicle ready for sale',
    'vehicle',
    'Mark an eligible vehicle Ready for Sale after inspection (and workshop when required)'
  ),
  (
    'vehicle.ready_for_sale.override',
    'Override ready for sale checks',
    'vehicle',
    'Bypass Ready for Sale eligibility checks with a recorded override reason'
  )
on conflict (key) do update
set
  name = excluded.name,
  module = excluded.module,
  description = excluded.description;

insert into public.role_permissions (role_id, permission_id)
select r.id, p.id
from public.roles r
cross join public.permissions p
where r.key = 'super_admin'
  and p.key in ('vehicle.ready_for_sale', 'vehicle.ready_for_sale.override')
on conflict do nothing;

insert into public.role_permissions (role_id, permission_id)
select r.id, p.id
from public.roles r
join public.permissions p on p.key = 'vehicle.ready_for_sale'
where r.key in ('admin', 'general_manager', 'inventory_manager')
on conflict do nothing;

insert into public.role_permissions (role_id, permission_id)
select r.id, p.id
from public.roles r
join public.permissions p on p.key = 'vehicle.ready_for_sale.override'
where r.key in ('admin', 'general_manager')
on conflict do nothing;

comment on function public.evaluate_vehicle_ready_for_sale is
  'Server-side Ready for Sale eligibility checklist (inspection, repairs, workshop, QC, documents).';
comment on function public.mark_vehicle_ready_for_sale is
  'Atomic transition to ready_for_sale with eligibility (or authorized override) and audit log.';
