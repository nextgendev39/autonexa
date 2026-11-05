-- Personal documents each user keeps in the app (ID, passport, visa, licence, contract…).
-- Private to the owner; Super Admins can see everyone's. Files live in the private
-- `staff-documents` bucket and are read/written only by the app with the service role,
-- after it checks who is asking. Downloads use short-lived signed URLs.

create table if not exists public.staff_documents (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references public.profiles (id) on delete cascade,
  category text not null default 'other',
  title text not null,
  file_name text not null,
  storage_path text not null,
  mime_type text,
  file_size integer,
  expires_on date,
  notes text,
  uploaded_by uuid references public.profiles (id) on delete set null,
  created_at timestamptz not null default timezone('utc', now()),
  updated_at timestamptz not null default timezone('utc', now()),
  constraint staff_documents_category_valid check (
    category in ('emirates_id', 'passport', 'visa', 'driving_license', 'contract', 'certificate', 'other')
  ),
  constraint staff_documents_title_not_blank check (length(trim(title)) > 0),
  constraint staff_documents_storage_path_unique unique (storage_path),
  constraint staff_documents_file_size_non_negative check (file_size is null or file_size >= 0)
);

create index if not exists staff_documents_user_id_idx on public.staff_documents (user_id, created_at desc);

drop trigger if exists staff_documents_set_updated_at on public.staff_documents;
create trigger staff_documents_set_updated_at
before update on public.staff_documents
for each row execute function public.set_updated_at();

alter table public.staff_documents enable row level security;

-- Reads only (writes go through the app). Owners see theirs; Super Admins see all.
drop policy if exists "staff_documents_select" on public.staff_documents;
create policy "staff_documents_select"
  on public.staff_documents for select to authenticated
  using (user_id = auth.uid() or public.is_super_admin());

grant select on public.staff_documents to authenticated;
grant select, insert, update, delete on public.staff_documents to service_role;

comment on table public.staff_documents is
  'Personal documents uploaded by staff. Private to the owner and Super Admins.';

-- Private bucket, no client storage policies: only the service role can touch objects.
insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values (
  'staff-documents',
  'staff-documents',
  false,
  10485760,
  array[
    'application/pdf',
    'image/jpeg',
    'image/png',
    'image/webp',
    'image/heic',
    'application/msword',
    'application/vnd.openxmlformats-officedocument.wordprocessingml.document'
  ]
)
on conflict (id) do update
set public = false,
    file_size_limit = excluded.file_size_limit,
    allowed_mime_types = excluded.allowed_mime_types;
