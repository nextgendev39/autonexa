-- Fix soft-delete / replace for documents.
-- Problem: documents_update required document.edit (branch-scoped), while many
-- staff roles only have document.create. Storage delete also required global
-- document.edit, so delete could fail with:
--   new row violates row-level security policy for table "documents"

-- ---------------------------------------------------------------------------
-- Table RLS: allow create OR edit to update/soft-delete documents
-- ---------------------------------------------------------------------------
drop policy if exists "documents_update" on public.documents;

create policy "documents_update"
  on public.documents for update to authenticated
  using (
    deleted_at is null
    and (
      public.has_permission_for_optional_branch('document.edit', branch_id)
      or public.has_permission_for_optional_branch('document.create', branch_id)
    )
  )
  with check (
    public.has_permission_for_optional_branch('document.edit', branch_id)
    or public.has_permission_for_optional_branch('document.create', branch_id)
  );

-- ---------------------------------------------------------------------------
-- Storage: align update/delete with create|edit (branch via helper)
-- ---------------------------------------------------------------------------
drop policy if exists "storage_vehicle_documents_update" on storage.objects;
drop policy if exists "storage_vehicle_documents_delete" on storage.objects;

create policy "storage_vehicle_documents_update"
  on storage.objects for update to authenticated
  using (
    bucket_id = 'vehicle-documents'
    and (
      public.has_permission('document.edit')
      or public.has_permission('document.create')
    )
    and public.can_access_vehicle_document_storage(public.storage_entity_id(name), true)
  )
  with check (
    bucket_id = 'vehicle-documents'
    and (
      public.has_permission('document.edit')
      or public.has_permission('document.create')
    )
    and public.can_access_vehicle_document_storage(public.storage_entity_id(name), true)
  );

create policy "storage_vehicle_documents_delete"
  on storage.objects for delete to authenticated
  using (
    bucket_id = 'vehicle-documents'
    and (
      public.has_permission('document.edit')
      or public.has_permission('document.create')
    )
    and public.can_access_vehicle_document_storage(public.storage_entity_id(name), true)
  );
