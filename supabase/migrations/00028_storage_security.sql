-- Phase 4: tighten Storage policies to permission + path entity checks.

-- Remove the permissive Phase 3 "Authenticated <action> <name> buckets" policies.
do $$
declare
  p record;
begin
  for p in
    select policyname
    from pg_policies
    where schemaname = 'storage'
      and tablename = 'objects'
      and policyname ~ '^Authenticated (read|insert|update|delete) [a-z]+ buckets$'
  loop
    execute format('drop policy if exists %I on storage.objects', p.policyname);
  end loop;
end;
$$;

-- Path helpers: first folder segment is the entity UUID.
create or replace function public.storage_entity_id(object_name text)
returns uuid
language plpgsql
immutable
as $$
declare
  segment text;
begin
  segment := split_part(object_name, '/', 1);
  if segment ~ '^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$' then
    return segment::uuid;
  end if;
  return null;
end;
$$;

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
        or (p_write and public.has_permission_for_branch('vehicle.edit', v.branch_id))
      )
  );
$$;

create or replace function public.can_access_inspection_storage(p_inspection_id uuid, p_write boolean)
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select exists (
    select 1
    from public.inspections i
    where i.id = p_inspection_id
      and (
        (not p_write and public.has_permission_for_branch('inspection.view', i.branch_id))
        or (
          p_write and (
            public.has_permission_for_branch('inspection.edit', i.branch_id)
            or public.has_permission_for_branch('inspection.create', i.branch_id)
          )
        )
      )
  );
$$;

create or replace function public.can_access_customer_storage(p_customer_id uuid, p_write boolean)
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select exists (
    select 1
    from public.customers c
    where c.id = p_customer_id
      and c.deleted_at is null
      and (
        (not p_write and public.has_permission_for_optional_branch('document.view', c.branch_id))
        or (p_write and public.has_permission_for_optional_branch('document.create', c.branch_id))
      )
  );
$$;

create or replace function public.can_access_sale_storage(p_sale_id uuid, p_write boolean)
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select exists (
    select 1
    from public.sales s
    where s.id = p_sale_id
      and (
        (not p_write and public.has_permission_for_branch('document.view', s.branch_id))
        or (p_write and public.has_permission_for_branch('document.create', s.branch_id))
      )
  );
$$;

revoke all on function public.storage_entity_id(text) from public;
revoke all on function public.can_access_vehicle_storage(uuid, boolean) from public;
revoke all on function public.can_access_inspection_storage(uuid, boolean) from public;
revoke all on function public.can_access_customer_storage(uuid, boolean) from public;
revoke all on function public.can_access_sale_storage(uuid, boolean) from public;

grant execute on function public.storage_entity_id(text) to authenticated;
grant execute on function public.can_access_vehicle_storage(uuid, boolean) to authenticated;
grant execute on function public.can_access_inspection_storage(uuid, boolean) to authenticated;
grant execute on function public.can_access_customer_storage(uuid, boolean) to authenticated;
grant execute on function public.can_access_sale_storage(uuid, boolean) to authenticated;

create policy "storage_vehicle_photos_select"
  on storage.objects for select to authenticated
  using (
    bucket_id = 'vehicle-photos'
    and public.can_access_vehicle_storage(public.storage_entity_id(name), false)
  );

create policy "storage_vehicle_photos_insert"
  on storage.objects for insert to authenticated
  with check (
    bucket_id = 'vehicle-photos'
    and public.can_access_vehicle_storage(public.storage_entity_id(name), true)
  );

create policy "storage_vehicle_photos_update"
  on storage.objects for update to authenticated
  using (
    bucket_id = 'vehicle-photos'
    and public.can_access_vehicle_storage(public.storage_entity_id(name), true)
  )
  with check (
    bucket_id = 'vehicle-photos'
    and public.can_access_vehicle_storage(public.storage_entity_id(name), true)
  );

create policy "storage_vehicle_photos_delete"
  on storage.objects for delete to authenticated
  using (
    bucket_id = 'vehicle-photos'
    and public.can_access_vehicle_storage(public.storage_entity_id(name), true)
  );

create policy "storage_vehicle_documents_select"
  on storage.objects for select to authenticated
  using (
    bucket_id = 'vehicle-documents'
    and public.has_permission('document.view')
    and public.can_access_vehicle_storage(public.storage_entity_id(name), false)
  );

create policy "storage_vehicle_documents_write"
  on storage.objects for insert to authenticated
  with check (
    bucket_id = 'vehicle-documents'
    and public.has_permission('document.create')
    and public.can_access_vehicle_storage(public.storage_entity_id(name), true)
  );

create policy "storage_vehicle_documents_update"
  on storage.objects for update to authenticated
  using (
    bucket_id = 'vehicle-documents'
    and public.has_permission('document.edit')
    and public.can_access_vehicle_storage(public.storage_entity_id(name), true)
  )
  with check (
    bucket_id = 'vehicle-documents'
    and public.has_permission('document.edit')
    and public.can_access_vehicle_storage(public.storage_entity_id(name), true)
  );

create policy "storage_vehicle_documents_delete"
  on storage.objects for delete to authenticated
  using (
    bucket_id = 'vehicle-documents'
    and public.has_permission('document.edit')
    and public.can_access_vehicle_storage(public.storage_entity_id(name), true)
  );

create policy "storage_inspection_photos_select"
  on storage.objects for select to authenticated
  using (
    bucket_id = 'inspection-photos'
    and public.can_access_inspection_storage(public.storage_entity_id(name), false)
  );

create policy "storage_inspection_photos_insert"
  on storage.objects for insert to authenticated
  with check (
    bucket_id = 'inspection-photos'
    and public.can_access_inspection_storage(public.storage_entity_id(name), true)
  );

create policy "storage_inspection_photos_update"
  on storage.objects for update to authenticated
  using (
    bucket_id = 'inspection-photos'
    and public.can_access_inspection_storage(public.storage_entity_id(name), true)
  )
  with check (
    bucket_id = 'inspection-photos'
    and public.can_access_inspection_storage(public.storage_entity_id(name), true)
  );

create policy "storage_inspection_photos_delete"
  on storage.objects for delete to authenticated
  using (
    bucket_id = 'inspection-photos'
    and public.can_access_inspection_storage(public.storage_entity_id(name), true)
  );

create policy "storage_customer_documents_select"
  on storage.objects for select to authenticated
  using (
    bucket_id = 'customer-documents'
    and public.can_access_customer_storage(public.storage_entity_id(name), false)
  );

create policy "storage_customer_documents_insert"
  on storage.objects for insert to authenticated
  with check (
    bucket_id = 'customer-documents'
    and public.can_access_customer_storage(public.storage_entity_id(name), true)
  );

create policy "storage_customer_documents_update"
  on storage.objects for update to authenticated
  using (
    bucket_id = 'customer-documents'
    and public.can_access_customer_storage(public.storage_entity_id(name), true)
  )
  with check (
    bucket_id = 'customer-documents'
    and public.can_access_customer_storage(public.storage_entity_id(name), true)
  );

create policy "storage_customer_documents_delete"
  on storage.objects for delete to authenticated
  using (
    bucket_id = 'customer-documents'
    and public.can_access_customer_storage(public.storage_entity_id(name), true)
  );

create policy "storage_sales_documents_select"
  on storage.objects for select to authenticated
  using (
    bucket_id = 'sales-documents'
    and public.can_access_sale_storage(public.storage_entity_id(name), false)
  );

create policy "storage_sales_documents_insert"
  on storage.objects for insert to authenticated
  with check (
    bucket_id = 'sales-documents'
    and public.can_access_sale_storage(public.storage_entity_id(name), true)
  );

create policy "storage_sales_documents_update"
  on storage.objects for update to authenticated
  using (
    bucket_id = 'sales-documents'
    and public.can_access_sale_storage(public.storage_entity_id(name), true)
  )
  with check (
    bucket_id = 'sales-documents'
    and public.can_access_sale_storage(public.storage_entity_id(name), true)
  );

create policy "storage_sales_documents_delete"
  on storage.objects for delete to authenticated
  using (
    bucket_id = 'sales-documents'
    and public.can_access_sale_storage(public.storage_entity_id(name), true)
  );
