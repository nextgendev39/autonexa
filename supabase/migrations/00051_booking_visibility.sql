-- Booking visibility: Super Admins and Accountants see every booking; everyone else
-- (sales executives and any other role with reservation access) sees only bookings
-- they created or that are assigned to them. Replaces the sales-executive-only rule
-- from 00049.

-- Accountants need to see bookings (deposits and agreed prices).
insert into public.role_permissions (role_id, permission_id)
select r.id, p.id
from public.roles r
join public.permissions p on p.key = 'reservation.view'
where r.key = 'accountant'
on conflict do nothing;

create or replace function public.can_view_all_bookings()
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select public.is_super_admin() or 'accountant' = any (public.current_user_roles());
$$;

revoke all on function public.can_view_all_bookings() from public;
grant execute on function public.can_view_all_bookings() to authenticated;

drop policy if exists "reservations_select" on public.reservations;
create policy "reservations_select"
  on public.reservations for select to authenticated
  using (
    public.has_permission_for_branch('reservation.view', branch_id)
    and (
      public.can_view_all_bookings()
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
      public.can_view_all_bookings()
      or created_by = auth.uid()
      or salesperson_id = auth.uid()
    )
  )
  with check (
    public.has_permission_for_branch('reservation.create', branch_id)
    or public.has_permission_for_branch('reservation.cancel', branch_id)
  );

drop function if exists public.is_sales_executive();
