-- Acquisition documents: reuse documents table + document_types + vehicle-documents bucket.
-- Run after migrations: supabase db query -f supabase/tests/acquisition_documents.sql

do $$
declare
  missing_cols text;
begin
  select string_agg(col, ', ')
  into missing_cols
  from (
    values
      ('title'),
      ('original_file_name'),
      ('reference_number'),
      ('notes')
  ) as required(col)
  where not exists (
    select 1
    from information_schema.columns c
    where c.table_schema = 'public'
      and c.table_name = 'documents'
      and c.column_name = required.col
  );

  if missing_cols is not null then
    raise exception 'documents missing columns: %', missing_cols;
  end if;
end $$;

do $$
declare
  missing_types text;
begin
  select string_agg(key, ', ')
  into missing_types
  from (
    values
      ('purchase_invoice'),
      ('auction_invoice'),
      ('seller_invoice'),
      ('purchase_agreement'),
      ('payment_receipt'),
      ('transport_document'),
      ('customs_document'),
      ('import_document'),
      ('registration_document'),
      ('inspection_document'),
      ('ownership_document'),
      ('other')
  ) as required(key)
  where not exists (
    select 1 from public.document_types dt where dt.key = required.key and dt.is_active
  );

  if missing_types is not null then
    raise exception 'document_types missing keys: %', missing_types;
  end if;
end $$;

do $$
begin
  if not exists (
    select 1 from storage.buckets where id = 'vehicle-documents' and public = false
  ) then
    raise exception 'vehicle-documents private bucket missing';
  end if;

  if to_regprocedure('public.can_access_vehicle_document_storage(uuid,boolean)') is null then
    raise exception 'can_access_vehicle_document_storage helper missing';
  end if;
end $$;

select 'acquisition_documents checks passed' as result;
