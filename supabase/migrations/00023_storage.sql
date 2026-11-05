-- Private Storage buckets. Objects are never public; use signed URLs or authenticated access.
-- Path convention examples:
--   vehicle-photos/{vehicle_id}/{uuid}-{filename}
--   vehicle-documents/{vehicle_id}/{uuid}-{filename}
--   inspection-photos/{inspection_id}/{uuid}-{filename}
--   customer-documents/{customer_id}/{uuid}-{filename}
--   sales-documents/{sale_id}/{uuid}-{filename}

insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values
  (
    'vehicle-photos',
    'vehicle-photos',
    false,
    15728640,
    array['image/jpeg', 'image/png', 'image/webp', 'image/heic', 'image/heif']
  ),
  (
    'vehicle-documents',
    'vehicle-documents',
    false,
    26214400,
    array[
      'application/pdf',
      'image/jpeg',
      'image/png',
      'image/webp',
      'application/msword',
      'application/vnd.openxmlformats-officedocument.wordprocessingml.document'
    ]
  ),
  (
    'inspection-photos',
    'inspection-photos',
    false,
    15728640,
    array['image/jpeg', 'image/png', 'image/webp', 'image/heic', 'image/heif']
  ),
  (
    'customer-documents',
    'customer-documents',
    false,
    26214400,
    array[
      'application/pdf',
      'image/jpeg',
      'image/png',
      'image/webp'
    ]
  ),
  (
    'sales-documents',
    'sales-documents',
    false,
    26214400,
    array[
      'application/pdf',
      'image/jpeg',
      'image/png',
      'image/webp'
    ]
  )
on conflict (id) do update
set
  public = excluded.public,
  file_size_limit = excluded.file_size_limit,
  allowed_mime_types = excluded.allowed_mime_types;

-- storage.objects already has RLS enabled on hosted Supabase.
-- The migration role is not the table owner, so do not ALTER it here.

drop policy if exists "Deny anon storage read" on storage.objects;
drop policy if exists "Deny anon storage write" on storage.objects;
drop policy if exists "Authenticated read staff buckets" on storage.objects;
drop policy if exists "Authenticated insert staff buckets" on storage.objects;
drop policy if exists "Authenticated update staff buckets" on storage.objects;
drop policy if exists "Authenticated delete staff buckets" on storage.objects;

-- Authenticated staff may read/write only within the private buckets.
-- Phase 4 will tighten this to branch/permission scoped policies.
create policy "Authenticated read staff buckets"
  on storage.objects
  for select
  to authenticated
  using (bucket_id in (
    'vehicle-photos',
    'vehicle-documents',
    'inspection-photos',
    'customer-documents',
    'sales-documents'
  ));

create policy "Authenticated insert staff buckets"
  on storage.objects
  for insert
  to authenticated
  with check (bucket_id in (
    'vehicle-photos',
    'vehicle-documents',
    'inspection-photos',
    'customer-documents',
    'sales-documents'
  ));

create policy "Authenticated update staff buckets"
  on storage.objects
  for update
  to authenticated
  using (bucket_id in (
    'vehicle-photos',
    'vehicle-documents',
    'inspection-photos',
    'customer-documents',
    'sales-documents'
  ))
  with check (bucket_id in (
    'vehicle-photos',
    'vehicle-documents',
    'inspection-photos',
    'customer-documents',
    'sales-documents'
  ));

create policy "Authenticated delete staff buckets"
  on storage.objects
  for delete
  to authenticated
  using (bucket_id in (
    'vehicle-photos',
    'vehicle-documents',
    'inspection-photos',
    'customer-documents',
    'sales-documents'
  ));
