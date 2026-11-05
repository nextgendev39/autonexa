-- Polymorphic document metadata. Files live in private Storage buckets.

create table public.document_types (
  id uuid primary key default gen_random_uuid(),
  key text not null,
  name text not null,
  description text,
  is_active boolean not null default true,
  created_at timestamptz not null default timezone('utc', now()),
  updated_at timestamptz not null default timezone('utc', now()),
  constraint document_types_key_unique unique (key),
  constraint document_types_name_not_blank check (length(trim(name)) > 0)
);

create table public.documents (
  id uuid primary key default gen_random_uuid(),
  document_type_id uuid not null references public.document_types (id),
  entity_type text not null,
  entity_id uuid not null,
  branch_id uuid references public.branches (id) on delete set null,
  storage_path text not null,
  file_name text not null,
  mime_type text,
  file_size integer,
  status public.document_status not null default 'active',
  expires_at timestamptz,
  uploaded_by uuid references public.profiles (id) on delete set null,
  deleted_at timestamptz,
  deleted_by uuid references public.profiles (id) on delete set null,
  created_at timestamptz not null default timezone('utc', now()),
  updated_at timestamptz not null default timezone('utc', now()),
  constraint documents_entity_type_not_blank check (length(trim(entity_type)) > 0),
  constraint documents_storage_path_not_blank check (length(trim(storage_path)) > 0),
  constraint documents_file_size_non_negative check (file_size is null or file_size >= 0)
);

-- Optional FK from vehicle_expenses.document_id now that documents exist.
alter table public.vehicle_expenses
  add constraint vehicle_expenses_document_id_fkey
  foreign key (document_id) references public.documents (id) on delete set null;

create trigger document_types_set_updated_at
before update on public.document_types
for each row execute function public.set_updated_at();

create trigger documents_set_updated_at
before update on public.documents
for each row execute function public.set_updated_at();

comment on table public.documents is
  'Generic document metadata (entity_type + entity_id). Soft-deleted. Private Storage only.';
