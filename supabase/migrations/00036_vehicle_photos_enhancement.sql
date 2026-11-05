-- Phase 5 enhancement: vehicle photo indexes + create-permission for photo writes.
-- Reuses existing public.vehicle_photos and storage bucket vehicle-photos.

create index if not exists vehicle_photos_vehicle_id_category_idx
  on public.vehicle_photos (vehicle_id, category);

create index if not exists vehicle_photos_vehicle_id_sort_order_idx
  on public.vehicle_photos (vehicle_id, sort_order);

-- Allow staff with create (not only edit) to upload photos after creating a vehicle.
create or replace function public.can_access_vehicle_storage(p_vehicle_id uuid, p_write boolean)
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select exists (
    select 1
    from public.vehicles v
    where v.id = p_vehicle_id
      and v.deleted_at is null
      and (
        (not p_write and public.has_permission_for_branch('vehicle.view', v.branch_id))
        or (
          p_write and (
            public.has_permission_for_branch('vehicle.edit', v.branch_id)
            or public.has_permission_for_branch('vehicle.create', v.branch_id)
          )
        )
      )
  );
$$;

drop policy if exists "vehicle_photos_mutate" on public.vehicle_photos;
create policy "vehicle_photos_mutate"
  on public.vehicle_photos for all to authenticated
  using (
    exists (
      select 1 from public.vehicles v
      where v.id = vehicle_id
        and v.deleted_at is null
        and (
          public.has_permission_for_branch('vehicle.edit', v.branch_id)
          or public.has_permission_for_branch('vehicle.create', v.branch_id)
        )
    )
  )
  with check (
    exists (
      select 1 from public.vehicles v
      where v.id = vehicle_id
        and v.deleted_at is null
        and (
          public.has_permission_for_branch('vehicle.edit', v.branch_id)
          or public.has_permission_for_branch('vehicle.create', v.branch_id)
        )
    )
  );

-- Atomically set a single primary photo for a vehicle.
create or replace function public.set_vehicle_photo_primary(p_photo_id uuid)
returns public.vehicle_photos
language plpgsql
security definer
set search_path = public
as $$
declare
  v_photo public.vehicle_photos%rowtype;
  v_branch uuid;
begin
  select * into v_photo from public.vehicle_photos where id = p_photo_id;
  if not found then
    raise exception 'photo not found';
  end if;

  select branch_id into v_branch
  from public.vehicles
  where id = v_photo.vehicle_id and deleted_at is null;

  if v_branch is null then
    raise exception 'vehicle not found';
  end if;

  if not public.can_access_branch(v_branch) then
    raise exception 'not authorized for branch';
  end if;

  if not public.has_permission_for_branch('vehicle.edit', v_branch)
     and not public.has_permission_for_branch('vehicle.create', v_branch) then
    raise exception 'not authorized';
  end if;

  update public.vehicle_photos
  set is_primary = false, updated_at = timezone('utc', now())
  where vehicle_id = v_photo.vehicle_id
    and is_primary = true
    and id is distinct from p_photo_id;

  update public.vehicle_photos
  set is_primary = true, updated_at = timezone('utc', now())
  where id = p_photo_id
  returning * into v_photo;

  return v_photo;
end;
$$;

revoke all on function public.set_vehicle_photo_primary(uuid) from public;
grant execute on function public.set_vehicle_photo_primary(uuid) to authenticated, service_role;

comment on function public.set_vehicle_photo_primary(uuid) is
  'Marks one vehicle photo as primary and clears any previous primary for that vehicle.';
