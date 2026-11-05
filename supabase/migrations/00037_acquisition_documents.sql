-- Acquisition document upload support.
-- Reuses public.documents (entity_type = 'acquisitions') and private bucket vehicle-documents.
-- Does NOT create a separate acquisition_documents table or duplicate storage copies.

-- ---------------------------------------------------------------------------
-- Metadata columns for acquisition (and other) documents
-- ---------------------------------------------------------------------------
alter table public.documents
  add column if not exists title text,
  add column if not exists original_file_name text,
  add column if not exists reference_number text,
  add column if not exists notes text;

comment on column public.documents.title is
  'Optional display name. Falls back to document type label or original file name.';
comment on column public.documents.original_file_name is
  'Original client file name at upload time.';
comment on column public.documents.reference_number is
  'Optional external reference (invoice no., auction lot, customs ref, etc.).';
comment on column public.documents.notes is
  'Optional free-text notes for the document.';

-- ---------------------------------------------------------------------------
-- Acquisition document type catalog (keys stored; labels via i18n)
-- ---------------------------------------------------------------------------
insert into public.document_types (key, name, description, is_active)
values
  ('purchase_invoice', 'Purchase Invoice', 'Vehicle purchase invoice', true),
  ('auction_invoice', 'Auction Invoice', 'Auction sale invoice', true),
  ('seller_invoice', 'Seller Invoice', 'Seller-issued invoice', true),
  ('purchase_agreement', 'Purchase Agreement', 'Acquisition purchase agreement', true),
  ('payment_receipt', 'Payment Receipt', 'Payment receipt for acquisition', true),
  ('transport_document', 'Transport Document', 'Transport / shipping document', true),
  ('customs_document', 'Customs Document', 'Customs paperwork', true),
  ('import_document', 'Import Document', 'Import paperwork', true),
  ('registration_document', 'Registration Document', 'Registration / mulkiya documents', true),
  ('inspection_document', 'Inspection Document', 'Inspection reports and attachments', true),
  ('ownership_document', 'Ownership Document', 'Ownership / title documents', true),
  ('other', 'Other', 'Uncategorized document', true)
on conflict (key) do update
set
  name = excluded.name,
  description = excluded.description,
  is_active = true,
  updated_at = timezone('utc', now());

-- ---------------------------------------------------------------------------
-- Storage access for vehicle-documents via document permissions
-- (vehicle.edit is not required — document officers / acquisition staff can upload)
-- ---------------------------------------------------------------------------
create or replace function public.can_access_vehicle_document_storage(
  p_vehicle_id uuid,
  p_write boolean
)
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
      and public.has_permission_for_branch('vehicle.view', v.branch_id)
      and (
        (not p_write and public.has_permission_for_branch('document.view', v.branch_id))
        or (
          p_write and (
            public.has_permission_for_branch('document.create', v.branch_id)
            or public.has_permission_for_branch('document.edit', v.branch_id)
          )
        )
      )
  );
$$;

revoke all on function public.can_access_vehicle_document_storage(uuid, boolean) from public;
grant execute on function public.can_access_vehicle_document_storage(uuid, boolean) to authenticated;

drop policy if exists "storage_vehicle_documents_select" on storage.objects;
drop policy if exists "storage_vehicle_documents_write" on storage.objects;
drop policy if exists "storage_vehicle_documents_update" on storage.objects;
drop policy if exists "storage_vehicle_documents_delete" on storage.objects;

create policy "storage_vehicle_documents_select"
  on storage.objects for select to authenticated
  using (
    bucket_id = 'vehicle-documents'
    and public.can_access_vehicle_document_storage(public.storage_entity_id(name), false)
  );

create policy "storage_vehicle_documents_write"
  on storage.objects for insert to authenticated
  with check (
    bucket_id = 'vehicle-documents'
    and public.has_permission('document.create')
    and public.can_access_vehicle_document_storage(public.storage_entity_id(name), true)
  );

create policy "storage_vehicle_documents_update"
  on storage.objects for update to authenticated
  using (
    bucket_id = 'vehicle-documents'
    and public.has_permission('document.edit')
    and public.can_access_vehicle_document_storage(public.storage_entity_id(name), true)
  )
  with check (
    bucket_id = 'vehicle-documents'
    and public.has_permission('document.edit')
    and public.can_access_vehicle_document_storage(public.storage_entity_id(name), true)
  );

create policy "storage_vehicle_documents_delete"
  on storage.objects for delete to authenticated
  using (
    bucket_id = 'vehicle-documents'
    and public.has_permission('document.edit')
    and public.can_access_vehicle_document_storage(public.storage_entity_id(name), true)
  );

-- Soft-delete remains the only remove path (no hard DELETE policy on documents).
-- Ensure update policy still allows setting deleted_at for authorized editors.
