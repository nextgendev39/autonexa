-- Bookings: agreed selling price, no mandatory hold-until date, and sales executives
-- limited to their own bookings.

alter table public.reservations
  add column if not exists selling_price numeric(14, 2);

do $$ begin
  alter table public.reservations
    add constraint reservations_selling_price_non_negative
    check (selling_price is null or selling_price >= 0);
exception when duplicate_object then null;
end $$;

comment on column public.reservations.selling_price is
  'Agreed selling price for the booked car. Must not be below vehicles.minimum_selling_price (checked by the app).';

-- Bookings no longer require a hold-until date; existing dates are kept.
-- reservations_expires_after_reserved still applies when a date is set (NULL passes the check).
alter table public.reservations alter column expires_at drop not null;

-- Sales executives (who are not Super Admins) only see and act on their own bookings.
create or replace function public.is_sales_executive()
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select 'sales_executive' = any (public.current_user_roles())
    and not public.is_super_admin();
$$;

revoke all on function public.is_sales_executive() from public;
grant execute on function public.is_sales_executive() to authenticated;

drop policy if exists "reservations_select" on public.reservations;
create policy "reservations_select"
  on public.reservations for select to authenticated
  using (
    public.has_permission_for_branch('reservation.view', branch_id)
    and (
      not public.is_sales_executive()
      or created_by = auth.uid()
      or salesperson_id = auth.uid()
    )
  );

drop policy if exists "reservations_update" on public.reservations;
create policy "reservations_update"
  on public.reservations for update to authenticated
  using (
    (
      public.has_permission_for_branch('reservation.create', branch_id)
      or public.has_permission_for_branch('reservation.cancel', branch_id)
    )
    and (
      not public.is_sales_executive()
      or created_by = auth.uid()
      or salesperson_id = auth.uid()
    )
  )
  with check (
    public.has_permission_for_branch('reservation.create', branch_id)
    or public.has_permission_for_branch('reservation.cancel', branch_id)
  );
