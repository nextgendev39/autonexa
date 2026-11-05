-- A booking belongs to its sales executive. When a sales executive books a colleague's
-- customer, the booking is assigned to that colleague (the customer's first sales executive)
-- and only they see it; the creator no longer does. The creator only owns bookings that
-- have no sales executive. Super Admins and Accountants still see every booking.
-- Replaces the created_by-or-salesperson rule from 00051.

drop policy if exists "reservations_select" on public.reservations;
create policy "reservations_select"
  on public.reservations for select to authenticated
  using (
    public.has_permission_for_branch('reservation.view', branch_id)
    and (
      public.can_view_all_bookings()
      or salesperson_id = auth.uid()
      or (salesperson_id is null and created_by = auth.uid())
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
      or salesperson_id = auth.uid()
      or (salesperson_id is null and created_by = auth.uid())
    )
  )
  with check (
    public.has_permission_for_branch('reservation.create', branch_id)
    or public.has_permission_for_branch('reservation.cancel', branch_id)
  );
