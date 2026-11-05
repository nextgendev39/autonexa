-- Remove tables the app never uses: inspections, leads, the unused finance tables
-- (bookings keep their payments on sales/reservations), vendors and history/log tables
-- nothing reads. Same approach as 00039 (workshop): rewrite live functions that still
-- touched them, drop their functions, then drop the tables.
-- Does not edit historical migrations.

-- ---------------------------------------------------------------------------
-- Ready for Sale: documents and status only (inspection was optional since 00040).
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
  v_missing_docs text[];
  v_checks jsonb := '[]'::jsonb;
  v_blockers jsonb := '[]'::jsonb;
  v_eligible boolean := true;
  v_can_override boolean := false;
  v_status_ok boolean := false;
  v_docs_ok boolean := true;
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

  v_checks := v_checks
    || jsonb_build_array(
      jsonb_build_object('key', 'documents', 'ok', v_docs_ok, 'label', 'Documents complete')
    )
    || jsonb_build_array(
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
    'checks', v_checks,
    'blockers', v_blockers
  );
end;
$$;

comment on function public.evaluate_vehicle_ready_for_sale is
  'Eligibility for Mark Ready for Sale: required documents and current status.';

-- ---------------------------------------------------------------------------
-- Split-unit merge: same as 00058 without moving leads.
-- ---------------------------------------------------------------------------

/**
 * Merges every Ready for sale record of p_vehicle_id's split family (records sharing the
 * same root, see vehicle_root_id) into the oldest one. Merged records are soft-deleted and
 * their bookings point at the remaining record. Returns that record's id.
 * Prices, photos and documents of the remaining record are kept.
 */
create or replace function public.merge_ready_split_units(p_vehicle_id uuid)
returns uuid
language plpgsql
security definer
set search_path = public
as $$
declare
  v_root uuid := public.vehicle_root_id(p_vehicle_id);
  v_keep public.vehicles%rowtype;
  v_row record;
begin
  -- Same branch only: units in another branch stay their own record.
  select v.* into v_keep
  from public.vehicles v
  where v.deleted_at is null
    and v.status = 'ready_for_sale'
    and public.vehicle_root_id(v.id) = v_root
    and v.branch_id = (select branch_id from public.vehicles where id = p_vehicle_id)
  order by v.created_at, v.id
  limit 1
  for update;

  if not found then
    return p_vehicle_id;
  end if;

  for v_row in
    select v.id, v.quantity
    from public.vehicles v
    where v.deleted_at is null
      and v.status = 'ready_for_sale'
      and v.id <> v_keep.id
      and v.branch_id = v_keep.branch_id
      and public.vehicle_root_id(v.id) = v_root
    for update
  loop
    -- Bookings on the merged record keep their unit count and follow the units.
    update public.reservations
    set units = coalesce(units, v_row.quantity),
        vehicle_id = v_keep.id
    where vehicle_id = v_row.id;

    -- Records split from the merged one now count it as their source.
    update public.vehicles set split_from_id = v_keep.id where split_from_id = v_row.id and id <> v_keep.id;

    update public.vehicles
    set quantity = quantity + v_row.quantity
    where id = v_keep.id;

    update public.vehicles
    set deleted_at = timezone('utc', now())
    where id = v_row.id;
  end loop;

  return v_keep.id;
end;
$$;

revoke all on function public.merge_ready_split_units(uuid) from public, anon, authenticated;
grant execute on function public.merge_ready_split_units(uuid) to service_role;

-- ---------------------------------------------------------------------------
-- Triggers and functions that only served the dropped tables
-- ---------------------------------------------------------------------------

-- Wrote vehicle_price_history; selling price changes are tracked in vehicle_pricing_history.
drop trigger if exists vehicles_track_price on public.vehicles;

drop policy if exists "storage_inspection_photos_select" on storage.objects;
drop policy if exists "storage_inspection_photos_insert" on storage.objects;
drop policy if exists "storage_inspection_photos_update" on storage.objects;
drop policy if exists "storage_inspection_photos_delete" on storage.objects;

do $$
declare
  v_fn regprocedure;
begin
  for v_fn in
    select p.oid::regprocedure
    from pg_proc p
    join pg_namespace n on n.oid = p.pronamespace
    where n.nspname = 'public'
      and p.proname = any (array[
        'approve_inspection',
        'assign_inspection',
        'can_access_inspection_storage',
        'cancel_inspection',
        'change_inspection_status',
        'enforce_inspection_status_transition',
        'get_inspection_validity_days',
        'inspection_allows_self_approval',
        'inspection_section_display_name',
        'inspections_assign_number',
        'is_valid_inspection_status_transition',
        'next_inspection_number',
        'populate_inspection_checklist',
        'read_inspection_costs',
        'reject_inspection',
        'request_reinspection',
        'start_inspection',
        'submit_inspection',
        'track_inspection_status_change',
        'update_approved_inspection_outcome',
        'track_vehicle_price_change',
        'map_vehicles_to_catalog'
      ])
  loop
    execute format('drop function if exists %s cascade', v_fn);
  end loop;
end
$$;

-- ---------------------------------------------------------------------------
-- Columns pointing at dropped tables
-- ---------------------------------------------------------------------------

alter table public.reservations drop column if exists lead_id;

-- ---------------------------------------------------------------------------
-- Tables (children first)
-- ---------------------------------------------------------------------------

-- Inspections
drop table if exists public.inspection_photos cascade;
drop table if exists public.inspection_recommendations cascade;
drop table if exists public.inspection_findings cascade;
drop table if exists public.inspection_items cascade;
drop table if exists public.inspection_sections cascade;
drop table if exists public.inspection_status_history cascade;
drop table if exists public.inspections cascade;
drop table if exists public.inspection_template_items cascade;
drop table if exists public.inspection_templates cascade;

-- Leads
drop table if exists public.lead_activities cascade;
drop table if exists public.leads cascade;
drop table if exists public.lead_sources cascade;

-- Finance
drop table if exists public.payment_allocations cascade;
drop table if exists public.invoices cascade;
drop table if exists public.payments cascade;
drop table if exists public.tax_rates cascade;

-- Leftovers
drop table if exists public.vendors cascade;
drop table if exists public.sale_price_history cascade;
drop table if exists public.vehicle_price_history cascade;
drop table if exists public.vehicle_catalog_mapping_unmatched cascade;

drop sequence if exists public.inspection_number_seq cascade;

