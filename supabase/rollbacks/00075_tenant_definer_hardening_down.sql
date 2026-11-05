-- Reverses 00075, including the anon grants: going back reopens the holes it closed.

drop policy storage_tenant_isolation on storage.objects;
drop function public.storage_object_in_current_tenant(text);
drop trigger a1_guard_record_links on public.documents;
drop trigger a1_guard_record_links on public.vehicle_photos;
drop function public.guard_record_links();
drop function public.tenant_of_record(uuid);

drop function public.cancel_unpaid_bookings(uuid);
drop function public.notify_overdue_balances(uuid);

CREATE OR REPLACE FUNCTION public.cancel_unpaid_bookings()
 RETURNS integer
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
declare
  v_row record;
  v_count integer := 0;
  v_minutes integer;
  v_reason text;
  v_vehicle_id uuid;
  v_stock_number text;
begin
  perform set_config('app.vehicle_status_reason', 'booking_deposit_not_received', true);

  for v_row in
    select
      r.id,
      r.tenant_id,
      r.reservation_number,
      r.vehicle_id,
      r.reserved_at,
      v.stock_number,
      concat_ws(' ', v.year, v.make, v.model) as vehicle_title,
      c.display_name as customer_name,
      p.display_name as salesperson_name
    from public.reservations r
    join public.vehicles v on v.id = r.vehicle_id
    left join public.customers c on c.id = r.customer_id
    left join public.profiles p on p.id = r.salesperson_id
    where r.status = 'active'
      and r.amount <= 0
      and r.reserved_at <= now() - make_interval(
        mins => public.tenant_term_minutes(r.tenant_id, 'booking.deposit_minutes', 4320)
      )
      and (r.cancellation_hold_status is null or r.cancellation_hold_status = 'rejected')
    for update of r skip locked
  loop
    v_minutes := public.tenant_term_minutes(v_row.tenant_id, 'booking.deposit_minutes', 4320);
    v_reason := format('Deposit not received within %s', public.format_minutes(v_minutes));

    update public.reservations
    set status = 'cancelled',
        cancelled_at = now(),
        cancel_reason = v_reason,
        auto_cancelled = true
    where id = v_row.id;

    update public.vehicles
    set status = 'ready_for_sale'
    where id = v_row.vehicle_id
      and status = 'reserved';

    -- Units split off for this booking rejoin the Ready for sale record they came from.
    v_vehicle_id := public.merge_ready_split_units(v_row.vehicle_id);
    select stock_number into v_stock_number from public.vehicles where id = v_vehicle_id;

    insert into public.notifications (user_id, type, title, message, entity_type, entity_id, data)
    select
      admin_id,
      'booking_auto_cancelled',
      'Booking cancelled: no deposit',
      format(
        'Booking %s (%s) was cancelled because no deposit was received within %s. The car is Ready for sale again.',
        v_row.reservation_number,
        coalesce(nullif(v_row.vehicle_title, ''), v_stock_number, 'vehicle'),
        public.format_minutes(v_minutes)
      ),
      'reservation',
      v_row.id,
      jsonb_build_object(
        'bookingNumber', v_row.reservation_number,
        'vehicleId', v_vehicle_id,
        'vehicleTitle', v_row.vehicle_title,
        'stockNumber', v_stock_number,
        'customerName', v_row.customer_name,
        'salespersonName', v_row.salesperson_name,
        'reservedAt', v_row.reserved_at,
        'deadlineMinutes', v_minutes
      )
    from public.active_super_admin_ids(v_row.tenant_id) as admin_id;

    v_count := v_count + 1;
  end loop;

  return v_count;
end;
$function$;

CREATE OR REPLACE FUNCTION public.notify_overdue_balances()
 RETURNS integer
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
declare
  v_row record;
  v_count integer := 0;
  v_minutes integer;
begin
  for v_row in
    select
      r.id,
      r.tenant_id,
      r.reservation_number,
      r.vehicle_id,
      r.salesperson_id,
      r.reserved_at,
      r.currency,
      round(r.selling_price * coalesce(v.quantity, 1), 2) as total,
      r.amount + coalesce(r.balance_received, 0) as paid,
      v.stock_number,
      concat_ws(' ', v.year, v.make, v.model) as vehicle_title,
      c.display_name as customer_name,
      p.display_name as salesperson_name,
      p.status = 'active' and p.deleted_at is null as salesperson_active
    from public.reservations r
    join public.vehicles v on v.id = r.vehicle_id
    left join public.customers c on c.id = r.customer_id
    left join public.profiles p on p.id = r.salesperson_id
    where r.status in ('active', 'converted')
      and r.balance_overdue_notified_at is null
      and r.selling_price is not null
      and r.reserved_at <= now() - make_interval(
        mins => public.tenant_term_minutes(r.tenant_id, 'booking.balance_minutes', 10080)
      )
      and r.amount + coalesce(r.balance_received, 0) < round(r.selling_price * coalesce(v.quantity, 1), 2)
    for update of r skip locked
  loop
    v_minutes := public.tenant_term_minutes(v_row.tenant_id, 'booking.balance_minutes', 10080);

    update public.reservations
    set balance_overdue_notified_at = now()
    where id = v_row.id;

    insert into public.notifications (user_id, type, title, message, entity_type, entity_id, data)
    select
      recipient,
      'booking_balance_overdue',
      'Full payment overdue',
      format(
        'Booking %s (%s) has not been paid in full within %s. Outstanding: %s %s.',
        v_row.reservation_number,
        coalesce(nullif(v_row.vehicle_title, ''), v_row.stock_number, 'vehicle'),
        public.format_minutes(v_minutes),
        v_row.currency,
        to_char(v_row.total - v_row.paid, 'FM999,999,999,990.00')
      ),
      'reservation',
      v_row.id,
      jsonb_build_object(
        'bookingNumber', v_row.reservation_number,
        'vehicleId', v_row.vehicle_id,
        'vehicleTitle', v_row.vehicle_title,
        'stockNumber', v_row.stock_number,
        'customerName', v_row.customer_name,
        'salespersonName', v_row.salesperson_name,
        'reservedAt', v_row.reserved_at,
        'deadlineMinutes', v_minutes,
        'currency', v_row.currency,
        'total', v_row.total,
        'paid', v_row.paid,
        'outstanding', v_row.total - v_row.paid
      )
    from (
      select admin_id as recipient from public.active_super_admin_ids(v_row.tenant_id) as admin_id
      union
      select v_row.salesperson_id where v_row.salesperson_id is not null and v_row.salesperson_active
    ) recipients;

    v_count := v_count + 1;
  end loop;

  return v_count;
end;
$function$;

CREATE OR REPLACE FUNCTION public.write_audit_log(p_action text, p_entity_type text, p_entity_id uuid, p_old_values jsonb DEFAULT NULL::jsonb, p_new_values jsonb DEFAULT NULL::jsonb, p_metadata jsonb DEFAULT '{}'::jsonb)
 RETURNS uuid
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
declare
  log_id uuid;
begin
  insert into public.audit_logs (
    tenant_id,
    user_id,
    action,
    entity_type,
    entity_id,
    old_values,
    new_values,
    metadata
  )
  values (
    coalesce(
      public.current_tenant_id(),
      (p_new_values ->> 'tenant_id')::uuid,
      (p_old_values ->> 'tenant_id')::uuid,
      public.resolve_insert_tenant_id()
    ),
    auth.uid(),
    p_action,
    p_entity_type,
    p_entity_id,
    p_old_values,
    p_new_values,
    coalesce(p_metadata, '{}'::jsonb)
  )
  returning id into log_id;

  return log_id;
end;
$function$;

create or replace function public.acquisition_expense_sum(p_acquisition_id uuid)
returns numeric
language sql
stable
security definer
set search_path = public
as $$
select coalesce(sum(e.amount), 0)::numeric(14, 2)
  from public.vehicle_expenses e
  where e.acquisition_id = p_acquisition_id
    and e.category is distinct from 'purchase'
    and (auth.uid() is null or e.tenant_id = (select public.current_tenant_id()));
$$;

create or replace function public.acquisition_total_cost(p_acquisition_id uuid)
returns numeric
language sql
stable
security definer
set search_path = public
as $$
select (
    coalesce(
      (select a.purchase_price from public.acquisitions a where a.id = p_acquisition_id and (auth.uid() is null or a.tenant_id = (select public.current_tenant_id()))),
      0
    )
    + public.acquisition_expense_sum(p_acquisition_id)
  )::numeric(14, 2);
$$;

create or replace function public.vehicle_other_expense_cost(p_vehicle_id uuid)
returns numeric
language sql
stable
security definer
set search_path = public
as $$
-- Expenses not tied to an acquisition (acquisition already rolled into total_acquisition_cost).
  select coalesce(sum(e.amount), 0)::numeric(14, 2)
  from public.vehicle_expenses e
  where e.vehicle_id = p_vehicle_id
    and e.acquisition_id is null
    and (auth.uid() is null or e.tenant_id = (select public.current_tenant_id()));
$$;

create or replace function public.vehicle_root_id(p_vehicle_id uuid)
returns uuid
language sql
stable
security definer
set search_path = public
as $$
with recursive chain as (
    select v.id, v.split_from_id, 0 as depth
    from public.vehicles v
    where v.id = p_vehicle_id
      and (auth.uid() is null or v.tenant_id = (select public.current_tenant_id()))
    union all
    select v.id, v.split_from_id, c.depth + 1
    from public.vehicles v
    join chain c on v.id = c.split_from_id
    where c.depth < 50
  )
  select case
    when not exists (select 1 from chain) and auth.uid() is not null then null
    else coalesce((select id from chain where split_from_id is null limit 1), p_vehicle_id)
  end;
$$;

alter default privileges in schema public grant execute on functions to anon;

grant execute on function acquisition_allows_self_approval() to public;
grant execute on function acquisition_allows_self_approval() to anon;
grant execute on function acquisition_expense_sum(uuid) to anon;
grant execute on function acquisition_total_cost(uuid) to anon;
grant execute on function acquisitions_assign_number() to public;
grant execute on function acquisitions_assign_number() to anon;
grant execute on function activate_invited_profile() to anon;
grant execute on function approve_acquisition(uuid,text) to anon;
grant execute on function approve_vehicle_pricing(uuid,text,boolean) to anon;
grant execute on function archive_vehicle(uuid,text) to anon;
grant execute on function assign_user_role(uuid,text,uuid) to anon;
grant execute on function audit_row_change() to public;
grant execute on function audit_row_change() to anon;
grant execute on function can_access_branch(uuid) to anon;
grant execute on function can_access_customer_storage(uuid,boolean) to anon;
grant execute on function can_access_sale_storage(uuid,boolean) to anon;
grant execute on function can_access_vehicle_document_storage(uuid,boolean) to anon;
grant execute on function can_access_vehicle_storage(uuid,boolean) to anon;
grant execute on function can_access_workshop_storage(uuid,boolean) to anon;
grant execute on function can_view_all_bookings() to anon;
grant execute on function cancel_acquisition(uuid,text) to anon;
grant execute on function catalog_slugify(text) to public;
grant execute on function catalog_slugify(text) to anon;
grant execute on function change_acquisition_status(uuid,acquisition_status,text) to anon;
grant execute on function change_vehicle_status(uuid,vehicle_status,text) to anon;
grant execute on function confirm_acquisition_purchase(uuid,text) to anon;
grant execute on function copyable_columns(text,text[]) to anon;
grant execute on function current_branch_id() to anon;
grant execute on function current_profile_id() to public;
grant execute on function current_profile_id() to anon;
grant execute on function current_user_permissions() to anon;
grant execute on function current_user_roles() to anon;
grant execute on function enforce_acquisition_status_transition() to public;
grant execute on function enforce_acquisition_status_transition() to anon;
grant execute on function enforce_reservation_vehicle_state() to public;
grant execute on function enforce_reservation_vehicle_state() to anon;
grant execute on function enforce_vehicle_location_branch() to public;
grant execute on function enforce_vehicle_location_branch() to anon;
grant execute on function enforce_vehicle_status_transition() to public;
grant execute on function enforce_vehicle_status_transition() to anon;
grant execute on function enforce_workshop_job_status_transition() to public;
grant execute on function enforce_workshop_job_status_transition() to anon;
grant execute on function enforce_workshop_status_transition() to public;
grant execute on function enforce_workshop_status_transition() to anon;
grant execute on function evaluate_vehicle_ready_for_sale(uuid) to anon;
grant execute on function format_minutes(integer) to public;
grant execute on function format_minutes(integer) to anon;
grant execute on function get_vehicle_cost_breakdown(uuid) to anon;
grant execute on function get_vehicle_profitability(uuid,numeric) to anon;
grant execute on function get_vehicle_total_cost(uuid) to anon;
grant execute on function handle_new_user() to public;
grant execute on function handle_new_user() to anon;
grant execute on function has_permission(text) to anon;
grant execute on function has_permission_for_branch(text,uuid) to anon;
grant execute on function has_permission_for_optional_branch(text,uuid) to anon;
grant execute on function has_role(text) to anon;
grant execute on function is_active_staff() to anon;
grant execute on function is_super_admin() to anon;
grant execute on function is_valid_acquisition_status_transition(acquisition_status,acquisition_status) to public;
grant execute on function is_valid_acquisition_status_transition(acquisition_status,acquisition_status) to anon;
grant execute on function is_valid_vehicle_status_transition(vehicle_status,vehicle_status) to public;
grant execute on function is_valid_vehicle_status_transition(vehicle_status,vehicle_status) to anon;
grant execute on function map_acquisition_source_to_vehicle_source(acquisition_source_type) to public;
grant execute on function map_acquisition_source_to_vehicle_source(acquisition_source_type) to anon;
grant execute on function mark_vehicle_ready_for_sale(uuid,text,boolean,text) to anon;
grant execute on function next_acquisition_number() to anon;
grant execute on function next_vehicle_stock_number() to anon;
grant execute on function prevent_referenced_catalog_delete() to public;
grant execute on function prevent_referenced_catalog_delete() to anon;
grant execute on function profiles_guard_self_update() to public;
grant execute on function profiles_guard_self_update() to anon;
grant execute on function read_acquisition_costs(uuid) to anon;
grant execute on function read_acquisitions_costs(uuid[]) to anon;
grant execute on function read_vehicle_costs(uuid) to anon;
grant execute on function read_vehicle_profit(uuid) to anon;
grant execute on function receive_acquisition(uuid,text) to anon;
grant execute on function reject_acquisition(uuid,text) to anon;
grant execute on function reservations_guard_cancellation_hold() to public;
grant execute on function reservations_guard_cancellation_hold() to anon;
grant execute on function reservations_guard_cancellation_hold_insert() to public;
grant execute on function reservations_guard_cancellation_hold_insert() to anon;
grant execute on function reservations_guard_refund() to public;
grant execute on function reservations_guard_refund() to anon;
grant execute on function reservations_require_minimum_price() to public;
grant execute on function reservations_require_minimum_price() to anon;
grant execute on function revoke_user_role(uuid) to anon;
grant execute on function set_updated_at() to public;
grant execute on function set_updated_at() to anon;
grant execute on function set_vehicle_photo_primary(uuid) to anon;
grant execute on function split_vehicle_units(uuid,integer,uuid) to anon;
grant execute on function storage_entity_id(text) to anon;
grant execute on function track_acquisition_status_change() to public;
grant execute on function track_acquisition_status_change() to anon;
grant execute on function track_vehicle_status_change() to public;
grant execute on function track_vehicle_status_change() to anon;
grant execute on function track_workshop_status_change() to public;
grant execute on function track_workshop_status_change() to anon;
grant execute on function transfer_vehicle(uuid,uuid,uuid,text) to anon;
grant execute on function trg_recalc_workshop_costs_from_job() to public;
grant execute on function trg_recalc_workshop_costs_from_job() to anon;
grant execute on function trg_recalc_workshop_costs_from_job_row() to public;
grant execute on function trg_recalc_workshop_costs_from_job_row() to anon;
grant execute on function undo_vehicle_split(uuid) to anon;
grant execute on function update_vehicle_costs(uuid,numeric,numeric) to anon;
grant execute on function upsert_vehicle_pricing(uuid,numeric,numeric,numeric,numeric,numeric,numeric,text,pricing_change_reason,text,boolean,text,boolean) to anon;
grant execute on function validate_vehicle_catalog_links() to public;
grant execute on function validate_vehicle_catalog_links() to anon;
grant execute on function vehicle_makes_set_slug() to public;
grant execute on function vehicle_makes_set_slug() to anon;
grant execute on function vehicle_models_set_slug() to public;
grant execute on function vehicle_models_set_slug() to anon;
grant execute on function vehicle_other_expense_cost(uuid) to anon;
grant execute on function vehicle_root_id(uuid) to anon;
grant execute on function vehicle_workshop_actual_cost(uuid) to anon;
grant execute on function vehicles_assign_stock_number() to public;
grant execute on function vehicles_assign_stock_number() to anon;
grant execute on function vehicles_guard_cost_columns() to public;
grant execute on function vehicles_guard_cost_columns() to anon;
grant execute on function write_audit_log(text,text,uuid,jsonb,jsonb,jsonb) to anon;
