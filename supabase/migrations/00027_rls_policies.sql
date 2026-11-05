-- Phase 4 RLS policies. Default deny remains; policies grant explicit access.
-- Drop Phase 3 bootstrap policies and replace with permission-aware versions.

drop policy if exists "profiles_select_own" on public.profiles;
drop policy if exists "profiles_update_own" on public.profiles;
drop policy if exists "notifications_select_own" on public.notifications;
drop policy if exists "notifications_update_own" on public.notifications;

-- ---------------------------------------------------------------------------
-- Profiles
-- ---------------------------------------------------------------------------
create policy "profiles_select"
  on public.profiles
  for select
  to authenticated
  using (
    deleted_at is null
    and (
      id = auth.uid()
      or public.has_permission('user.manage')
      or public.is_super_admin()
    )
  );

create policy "profiles_update_own"
  on public.profiles
  for update
  to authenticated
  using (id = auth.uid() and deleted_at is null and public.is_active_staff())
  with check (id = auth.uid() and deleted_at is null);

-- Prevent non-admins from changing status, branch, or soft-delete on their own row.
create or replace function public.profiles_guard_self_update()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  if auth.uid() is null then
    return new;
  end if;

  if new.id = auth.uid() and not public.has_permission('user.manage') then
    if new.status is distinct from old.status
       or new.branch_id is distinct from old.branch_id
       or new.deleted_at is distinct from old.deleted_at
       or new.employee_code is distinct from old.employee_code then
      raise exception 'not authorized to change protected profile fields';
    end if;
  end if;

  return new;
end;
$$;

drop trigger if exists profiles_guard_self_update on public.profiles;
create trigger profiles_guard_self_update
before update on public.profiles
for each row execute function public.profiles_guard_self_update();

create policy "profiles_update_manage"
  on public.profiles
  for update
  to authenticated
  using (public.has_permission('user.manage') and deleted_at is null)
  with check (public.has_permission('user.manage'));

-- ---------------------------------------------------------------------------
-- RBAC tables
-- ---------------------------------------------------------------------------
create policy "roles_select"
  on public.roles for select to authenticated
  using (public.is_active_staff());

create policy "roles_manage"
  on public.roles for all to authenticated
  using (public.has_permission('role.manage'))
  with check (public.has_permission('role.manage') and is_system = false);

create policy "permissions_select"
  on public.permissions for select to authenticated
  using (public.is_active_staff());

create policy "role_permissions_select"
  on public.role_permissions for select to authenticated
  using (public.is_active_staff());

create policy "role_permissions_manage"
  on public.role_permissions for all to authenticated
  using (public.has_permission('role.manage') and public.is_super_admin())
  with check (public.has_permission('role.manage') and public.is_super_admin());

create policy "user_roles_select"
  on public.user_roles for select to authenticated
  using (
    user_id = auth.uid()
    or public.has_permission('user.manage')
    or public.has_permission('role.manage')
  );

-- Direct inserts/updates/deletes on user_roles are denied for normal clients.
-- Use assign_user_role / revoke_user_role SECURITY DEFINER RPCs instead.
create policy "user_roles_manage_super"
  on public.user_roles for all to authenticated
  using (public.is_super_admin())
  with check (public.is_super_admin());

-- ---------------------------------------------------------------------------
-- Branches
-- ---------------------------------------------------------------------------
create policy "branches_select"
  on public.branches for select to authenticated
  using (
    public.has_permission('branch.view')
    or public.can_access_branch(id)
  );

create policy "branches_manage"
  on public.branches for all to authenticated
  using (public.has_permission('branch.manage'))
  with check (public.has_permission('branch.manage'));

-- ---------------------------------------------------------------------------
-- Vehicles
-- ---------------------------------------------------------------------------
create policy "vehicles_select"
  on public.vehicles for select to authenticated
  using (
    deleted_at is null
    and public.has_permission_for_branch('vehicle.view', branch_id)
  );

create policy "vehicles_insert"
  on public.vehicles for insert to authenticated
  with check (public.has_permission_for_branch('vehicle.create', branch_id));

create policy "vehicles_update"
  on public.vehicles for update to authenticated
  using (
    deleted_at is null
    and public.has_permission_for_branch('vehicle.edit', branch_id)
  )
  with check (public.has_permission_for_branch('vehicle.edit', branch_id));

create policy "vehicles_delete"
  on public.vehicles for delete to authenticated
  using (public.has_permission_for_branch('vehicle.delete', branch_id));

-- Sensitive cost columns: withhold from direct authenticated SELECT when grants allow.
-- Access via read_vehicle_costs / read_vehicle_profit / update_vehicle_costs.
do $$
begin
  revoke select (total_acquisition_cost, minimum_selling_price) on public.vehicles from authenticated;
  revoke update (total_acquisition_cost, minimum_selling_price) on public.vehicles from authenticated;
exception
  when undefined_object then
    raise notice 'Skipping vehicle cost column revoke (role/grants not present yet)';
  when others then
    raise notice 'Skipping vehicle cost column revoke: %', sqlerrm;
end $$;

create or replace function public.vehicles_guard_cost_columns()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  if tg_op = 'UPDATE' then
    if new.total_acquisition_cost is distinct from old.total_acquisition_cost
       or new.minimum_selling_price is distinct from old.minimum_selling_price then
      if not public.has_permission_for_branch('vehicle.cost.edit', new.branch_id)
         and not public.has_permission_for_branch('vehicle.profit.view', new.branch_id) then
        -- cost.edit for acquisition cost; price managers may touch minimum with profit/price edit
        if not public.has_permission_for_branch('vehicle.price.edit', new.branch_id) then
          raise exception 'not authorized to change vehicle cost fields';
        end if;
      end if;
    end if;
  elsif tg_op = 'INSERT' then
    if (new.total_acquisition_cost is distinct from 0)
       and not public.has_permission_for_branch('vehicle.cost.edit', new.branch_id)
       and not public.has_permission_for_branch('vehicle.create', new.branch_id) then
      raise exception 'not authorized to set vehicle cost fields';
    end if;
  end if;
  return new;
end;
$$;

drop trigger if exists vehicles_guard_cost_columns on public.vehicles;
create trigger vehicles_guard_cost_columns
before insert or update on public.vehicles
for each row execute function public.vehicles_guard_cost_columns();

-- Re-assert grants for non-sensitive columns; cost cols stay revoked when possible.
do $$
begin
  grant select, insert, update, delete on public.vehicles to authenticated;
  revoke select (total_acquisition_cost, minimum_selling_price) on public.vehicles from authenticated;
  revoke update (total_acquisition_cost, minimum_selling_price) on public.vehicles from authenticated;
exception
  when others then
    raise notice 'Vehicle grant/revoke adjustment skipped: %', sqlerrm;
end $$;

create or replace function public.update_vehicle_costs(
  p_vehicle_id uuid,
  p_total_acquisition_cost numeric default null,
  p_minimum_selling_price numeric default null
)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  v_branch uuid;
begin
  select branch_id into v_branch
  from public.vehicles
  where id = p_vehicle_id and deleted_at is null;

  if v_branch is null then
    raise exception 'vehicle not found';
  end if;

  if p_total_acquisition_cost is not null
     and not public.has_permission_for_branch('vehicle.cost.edit', v_branch) then
    raise exception 'not authorized';
  end if;

  if p_minimum_selling_price is not null
     and not (
       public.has_permission_for_branch('vehicle.cost.edit', v_branch)
       or public.has_permission_for_branch('vehicle.price.edit', v_branch)
     ) then
    raise exception 'not authorized';
  end if;

  update public.vehicles
  set
    total_acquisition_cost = coalesce(p_total_acquisition_cost, total_acquisition_cost),
    minimum_selling_price = coalesce(p_minimum_selling_price, minimum_selling_price),
    updated_at = timezone('utc', now())
  where id = p_vehicle_id;
end;
$$;

revoke all on function public.update_vehicle_costs(uuid, numeric, numeric) from public;
grant execute on function public.update_vehicle_costs(uuid, numeric, numeric) to authenticated;

-- ---------------------------------------------------------------------------
-- Vehicle related
-- ---------------------------------------------------------------------------
create policy "vehicle_expenses_select"
  on public.vehicle_expenses for select to authenticated
  using (
    exists (
      select 1 from public.vehicles v
      where v.id = vehicle_id
        and v.deleted_at is null
        and public.has_permission_for_branch('vehicle.cost.view', v.branch_id)
    )
  );

create policy "vehicle_expenses_mutate"
  on public.vehicle_expenses for all to authenticated
  using (
    exists (
      select 1 from public.vehicles v
      where v.id = vehicle_id
        and v.deleted_at is null
        and public.has_permission_for_branch('vehicle.cost.edit', v.branch_id)
    )
  )
  with check (
    exists (
      select 1 from public.vehicles v
      where v.id = vehicle_id
        and v.deleted_at is null
        and public.has_permission_for_branch('vehicle.cost.edit', v.branch_id)
    )
  );

create policy "vehicle_price_history_select"
  on public.vehicle_price_history for select to authenticated
  using (
    exists (
      select 1 from public.vehicles v
      where v.id = vehicle_id
        and v.deleted_at is null
        and public.has_permission_for_branch('vehicle.price.view', v.branch_id)
    )
  );

create policy "vehicle_status_history_select"
  on public.vehicle_status_history for select to authenticated
  using (
    exists (
      select 1 from public.vehicles v
      where v.id = vehicle_id
        and v.deleted_at is null
        and public.has_permission_for_branch('vehicle.view', v.branch_id)
    )
  );

create policy "vehicle_photos_select"
  on public.vehicle_photos for select to authenticated
  using (
    exists (
      select 1 from public.vehicles v
      where v.id = vehicle_id
        and v.deleted_at is null
        and public.has_permission_for_branch('vehicle.view', v.branch_id)
    )
  );

create policy "vehicle_photos_mutate"
  on public.vehicle_photos for all to authenticated
  using (
    exists (
      select 1 from public.vehicles v
      where v.id = vehicle_id
        and v.deleted_at is null
        and public.has_permission_for_branch('vehicle.edit', v.branch_id)
    )
  )
  with check (
    exists (
      select 1 from public.vehicles v
      where v.id = vehicle_id
        and v.deleted_at is null
        and public.has_permission_for_branch('vehicle.edit', v.branch_id)
    )
  );

create policy "suppliers_select"
  on public.suppliers for select to authenticated
  using (public.has_permission('acquisition.view') or public.has_permission('vehicle.view'));

create policy "suppliers_mutate"
  on public.suppliers for all to authenticated
  using (public.has_permission('acquisition.edit') or public.has_permission('acquisition.create'))
  with check (public.has_permission('acquisition.edit') or public.has_permission('acquisition.create'));

-- ---------------------------------------------------------------------------
-- Acquisitions
-- ---------------------------------------------------------------------------
create policy "acquisitions_select"
  on public.acquisitions for select to authenticated
  using (public.has_permission_for_branch('acquisition.view', branch_id));

create policy "acquisitions_insert"
  on public.acquisitions for insert to authenticated
  with check (public.has_permission_for_branch('acquisition.create', branch_id));

create policy "acquisitions_update"
  on public.acquisitions for update to authenticated
  using (public.has_permission_for_branch('acquisition.edit', branch_id))
  with check (public.has_permission_for_branch('acquisition.edit', branch_id));

-- ---------------------------------------------------------------------------
-- Inspections
-- ---------------------------------------------------------------------------
create policy "inspection_templates_select"
  on public.inspection_templates for select to authenticated
  using (public.has_permission('inspection.view') or public.has_permission('inspection.create'));

create policy "inspection_template_items_select"
  on public.inspection_template_items for select to authenticated
  using (public.has_permission('inspection.view') or public.has_permission('inspection.create'));

create policy "inspections_select"
  on public.inspections for select to authenticated
  using (public.has_permission_for_branch('inspection.view', branch_id));

create policy "inspections_insert"
  on public.inspections for insert to authenticated
  with check (public.has_permission_for_branch('inspection.create', branch_id));

create policy "inspections_update"
  on public.inspections for update to authenticated
  using (
    public.has_permission_for_branch('inspection.edit', branch_id)
    or public.has_permission_for_branch('inspection.approve', branch_id)
  )
  with check (
    public.has_permission_for_branch('inspection.edit', branch_id)
    or public.has_permission_for_branch('inspection.approve', branch_id)
  );

create policy "inspection_items_select"
  on public.inspection_items for select to authenticated
  using (
    exists (
      select 1 from public.inspections i
      where i.id = inspection_id
        and public.has_permission_for_branch('inspection.view', i.branch_id)
    )
  );

create policy "inspection_items_mutate"
  on public.inspection_items for all to authenticated
  using (
    exists (
      select 1 from public.inspections i
      where i.id = inspection_id
        and public.has_permission_for_branch('inspection.edit', i.branch_id)
    )
  )
  with check (
    exists (
      select 1 from public.inspections i
      where i.id = inspection_id
        and public.has_permission_for_branch('inspection.edit', i.branch_id)
    )
  );

create policy "inspection_photos_select"
  on public.inspection_photos for select to authenticated
  using (
    exists (
      select 1 from public.inspections i
      where i.id = inspection_id
        and public.has_permission_for_branch('inspection.view', i.branch_id)
    )
  );

create policy "inspection_photos_mutate"
  on public.inspection_photos for all to authenticated
  using (
    exists (
      select 1 from public.inspections i
      where i.id = inspection_id
        and (
          public.has_permission_for_branch('inspection.edit', i.branch_id)
          or public.has_permission_for_branch('inspection.create', i.branch_id)
        )
    )
  )
  with check (
    exists (
      select 1 from public.inspections i
      where i.id = inspection_id
        and (
          public.has_permission_for_branch('inspection.edit', i.branch_id)
          or public.has_permission_for_branch('inspection.create', i.branch_id)
        )
    )
  );

-- ---------------------------------------------------------------------------
-- Workshop
-- ---------------------------------------------------------------------------
create policy "workshop_orders_select"
  on public.workshop_orders for select to authenticated
  using (public.has_permission_for_branch('workshop.view', branch_id));

create policy "workshop_orders_insert"
  on public.workshop_orders for insert to authenticated
  with check (public.has_permission_for_branch('workshop.create', branch_id));

create policy "workshop_orders_update"
  on public.workshop_orders for update to authenticated
  using (public.has_permission_for_branch('workshop.edit', branch_id))
  with check (public.has_permission_for_branch('workshop.edit', branch_id));

create policy "workshop_items_select"
  on public.workshop_items for select to authenticated
  using (
    exists (
      select 1 from public.workshop_orders w
      where w.id = workshop_order_id
        and public.has_permission_for_branch('workshop.view', w.branch_id)
    )
  );

create policy "workshop_items_mutate"
  on public.workshop_items for all to authenticated
  using (
    exists (
      select 1 from public.workshop_orders w
      where w.id = workshop_order_id
        and public.has_permission_for_branch('workshop.edit', w.branch_id)
    )
  )
  with check (
    exists (
      select 1 from public.workshop_orders w
      where w.id = workshop_order_id
        and public.has_permission_for_branch('workshop.edit', w.branch_id)
    )
  );

-- ---------------------------------------------------------------------------
-- Customers / leads
-- ---------------------------------------------------------------------------
create policy "customers_select"
  on public.customers for select to authenticated
  using (
    deleted_at is null
    and public.has_permission_for_optional_branch('customer.view', branch_id)
  );

create policy "customers_insert"
  on public.customers for insert to authenticated
  with check (public.has_permission_for_optional_branch('customer.create', branch_id));

create policy "customers_update"
  on public.customers for update to authenticated
  using (
    deleted_at is null
    and public.has_permission_for_optional_branch('customer.edit', branch_id)
  )
  with check (public.has_permission_for_optional_branch('customer.edit', branch_id));

create policy "lead_sources_select"
  on public.lead_sources for select to authenticated
  using (public.has_permission('lead.view') or public.has_permission('lead.create'));

create policy "leads_select"
  on public.leads for select to authenticated
  using (
    deleted_at is null
    and (
      public.has_permission_for_branch('lead.view', branch_id)
      or (
        assigned_to = auth.uid()
        and public.has_permission('lead.view')
      )
    )
  );

create policy "leads_insert"
  on public.leads for insert to authenticated
  with check (public.has_permission_for_branch('lead.create', branch_id));

create policy "leads_update"
  on public.leads for update to authenticated
  using (
    deleted_at is null
    and (
      public.has_permission_for_branch('lead.edit', branch_id)
      or (assigned_to = auth.uid() and public.has_permission('lead.edit'))
    )
  )
  with check (
    public.has_permission_for_branch('lead.edit', branch_id)
    or (assigned_to = auth.uid() and public.has_permission('lead.edit'))
  );

create policy "lead_activities_select"
  on public.lead_activities for select to authenticated
  using (
    exists (
      select 1 from public.leads l
      where l.id = lead_id
        and l.deleted_at is null
        and (
          public.has_permission_for_branch('lead.view', l.branch_id)
          or (l.assigned_to = auth.uid() and public.has_permission('lead.view'))
        )
    )
  );

create policy "lead_activities_mutate"
  on public.lead_activities for all to authenticated
  using (
    exists (
      select 1 from public.leads l
      where l.id = lead_id
        and (
          public.has_permission_for_branch('lead.edit', l.branch_id)
          or (l.assigned_to = auth.uid() and public.has_permission('lead.edit'))
        )
    )
  )
  with check (
    exists (
      select 1 from public.leads l
      where l.id = lead_id
        and (
          public.has_permission_for_branch('lead.edit', l.branch_id)
          or (l.assigned_to = auth.uid() and public.has_permission('lead.edit'))
        )
    )
  );

-- ---------------------------------------------------------------------------
-- Reservations / sales
-- ---------------------------------------------------------------------------
create policy "reservations_select"
  on public.reservations for select to authenticated
  using (public.has_permission_for_branch('reservation.view', branch_id));

create policy "reservations_insert"
  on public.reservations for insert to authenticated
  with check (public.has_permission_for_branch('reservation.create', branch_id));

create policy "reservations_update"
  on public.reservations for update to authenticated
  using (
    public.has_permission_for_branch('reservation.create', branch_id)
    or public.has_permission_for_branch('reservation.cancel', branch_id)
  )
  with check (
    public.has_permission_for_branch('reservation.create', branch_id)
    or public.has_permission_for_branch('reservation.cancel', branch_id)
  );

create policy "sales_select"
  on public.sales for select to authenticated
  using (
    public.has_permission_for_branch('sale.view', branch_id)
    or (salesperson_id = auth.uid() and public.has_permission('sale.view'))
  );

create policy "sales_insert"
  on public.sales for insert to authenticated
  with check (public.has_permission_for_branch('sale.create', branch_id));

create policy "sales_update"
  on public.sales for update to authenticated
  using (
    public.has_permission_for_branch('sale.edit', branch_id)
    or public.has_permission_for_branch('sale.cancel', branch_id)
  )
  with check (
    public.has_permission_for_branch('sale.edit', branch_id)
    or public.has_permission_for_branch('sale.cancel', branch_id)
  );

create policy "sale_price_history_select"
  on public.sale_price_history for select to authenticated
  using (
    exists (
      select 1 from public.sales s
      where s.id = sale_id
        and public.has_permission_for_branch('sale.view', s.branch_id)
    )
  );

-- ---------------------------------------------------------------------------
-- Payments / invoices
-- ---------------------------------------------------------------------------
create policy "payments_select"
  on public.payments for select to authenticated
  using (public.has_permission_for_optional_branch('payment.view', branch_id));

create policy "payments_insert"
  on public.payments for insert to authenticated
  with check (public.has_permission_for_optional_branch('payment.create', branch_id));

create policy "payments_update"
  on public.payments for update to authenticated
  using (
    public.has_permission_for_optional_branch('payment.create', branch_id)
    or public.has_permission_for_optional_branch('payment.refund', branch_id)
  )
  with check (
    public.has_permission_for_optional_branch('payment.create', branch_id)
    or public.has_permission_for_optional_branch('payment.refund', branch_id)
  );

create policy "payment_allocations_select"
  on public.payment_allocations for select to authenticated
  using (
    exists (
      select 1 from public.payments p
      where p.id = payment_id
        and public.has_permission_for_optional_branch('payment.view', p.branch_id)
    )
  );

create policy "payment_allocations_mutate"
  on public.payment_allocations for all to authenticated
  using (
    exists (
      select 1 from public.payments p
      where p.id = payment_id
        and public.has_permission_for_optional_branch('payment.create', p.branch_id)
    )
  )
  with check (
    exists (
      select 1 from public.payments p
      where p.id = payment_id
        and public.has_permission_for_optional_branch('payment.create', p.branch_id)
    )
  );

create policy "tax_rates_select"
  on public.tax_rates for select to authenticated
  using (
    public.has_permission('invoice.view')
    or public.has_permission('sale.view')
    or public.has_permission('payment.view')
  );

create policy "invoices_select"
  on public.invoices for select to authenticated
  using (public.has_permission_for_branch('invoice.view', branch_id));

create policy "invoices_insert"
  on public.invoices for insert to authenticated
  with check (public.has_permission_for_branch('invoice.create', branch_id));

create policy "invoices_update"
  on public.invoices for update to authenticated
  using (public.has_permission_for_branch('invoice.edit', branch_id))
  with check (public.has_permission_for_branch('invoice.edit', branch_id));

-- ---------------------------------------------------------------------------
-- Documents / notifications / audit
-- ---------------------------------------------------------------------------
create policy "document_types_select"
  on public.document_types for select to authenticated
  using (public.has_permission('document.view') or public.has_permission('document.create'));

create policy "documents_select"
  on public.documents for select to authenticated
  using (
    deleted_at is null
    and public.has_permission_for_optional_branch('document.view', branch_id)
  );

create policy "documents_insert"
  on public.documents for insert to authenticated
  with check (public.has_permission_for_optional_branch('document.create', branch_id));

create policy "documents_update"
  on public.documents for update to authenticated
  using (
    deleted_at is null
    and public.has_permission_for_optional_branch('document.edit', branch_id)
  )
  with check (public.has_permission_for_optional_branch('document.edit', branch_id));

create policy "notifications_select_own"
  on public.notifications for select to authenticated
  using (user_id = auth.uid() and public.has_permission('notification.view'));

create policy "notifications_update_own"
  on public.notifications for update to authenticated
  using (user_id = auth.uid())
  with check (user_id = auth.uid());

create policy "notifications_insert_manage"
  on public.notifications for insert to authenticated
  with check (public.has_permission('user.manage') or public.is_super_admin());

create policy "audit_logs_select"
  on public.audit_logs for select to authenticated
  using (public.has_permission('audit.view'));

-- No update/delete policies on audit_logs → immutable for clients.
