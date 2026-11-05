-- Configurable inspection templates and inspection runs.

create table public.inspection_templates (
  id uuid primary key default gen_random_uuid(),
  name text not null,
  description text,
  is_active boolean not null default true,
  created_at timestamptz not null default timezone('utc', now()),
  updated_at timestamptz not null default timezone('utc', now()),
  constraint inspection_templates_name_not_blank check (length(trim(name)) > 0)
);

create table public.inspection_template_items (
  id uuid primary key default gen_random_uuid(),
  template_id uuid not null references public.inspection_templates (id) on delete cascade,
  name text not null,
  category text not null,
  description text,
  sort_order integer not null default 0,
  is_required boolean not null default true,
  created_at timestamptz not null default timezone('utc', now()),
  updated_at timestamptz not null default timezone('utc', now()),
  constraint inspection_template_items_name_not_blank check (length(trim(name)) > 0),
  constraint inspection_template_items_category_not_blank check (length(trim(category)) > 0)
);

create table public.inspections (
  id uuid primary key default gen_random_uuid(),
  vehicle_id uuid not null references public.vehicles (id) on delete restrict,
  template_id uuid references public.inspection_templates (id) on delete set null,
  branch_id uuid not null references public.branches (id),
  inspector_id uuid references public.profiles (id) on delete set null,
  status public.inspection_status not null default 'pending',
  result public.inspection_result,
  started_at timestamptz,
  completed_at timestamptz,
  notes text,
  created_by uuid references public.profiles (id) on delete set null,
  created_at timestamptz not null default timezone('utc', now()),
  updated_at timestamptz not null default timezone('utc', now()),
  constraint inspections_completed_after_started check (
    completed_at is null or started_at is null or completed_at >= started_at
  )
);

create table public.inspection_items (
  id uuid primary key default gen_random_uuid(),
  inspection_id uuid not null references public.inspections (id) on delete cascade,
  template_item_id uuid references public.inspection_template_items (id) on delete set null,
  name text not null,
  category text not null,
  result public.inspection_item_result,
  notes text,
  severity text,
  created_at timestamptz not null default timezone('utc', now()),
  updated_at timestamptz not null default timezone('utc', now()),
  constraint inspection_items_name_not_blank check (length(trim(name)) > 0)
);

create table public.inspection_photos (
  id uuid primary key default gen_random_uuid(),
  inspection_id uuid not null references public.inspections (id) on delete cascade,
  inspection_item_id uuid references public.inspection_items (id) on delete set null,
  storage_path text not null,
  caption text,
  uploaded_by uuid references public.profiles (id) on delete set null,
  created_at timestamptz not null default timezone('utc', now()),
  constraint inspection_photos_storage_path_not_blank check (length(trim(storage_path)) > 0)
);

create trigger inspection_templates_set_updated_at
before update on public.inspection_templates
for each row execute function public.set_updated_at();

create trigger inspection_template_items_set_updated_at
before update on public.inspection_template_items
for each row execute function public.set_updated_at();

create trigger inspections_set_updated_at
before update on public.inspections
for each row execute function public.set_updated_at();

create trigger inspection_items_set_updated_at
before update on public.inspection_items
for each row execute function public.set_updated_at();

comment on table public.inspection_templates is
  'Editable checklists. Categories such as Exterior/Interior are data, not app constants.';
comment on table public.inspection_photos is
  'Inspection image metadata. Files in the inspection-photos storage bucket.';
