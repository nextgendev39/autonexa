-- Branches across UAE emirates. manager_user_id is constrained after profiles exist.

create table public.branches (
  id uuid primary key default gen_random_uuid(),
  name text not null,
  code text not null,
  emirate public.uae_emirate not null,
  address_line_1 text not null,
  address_line_2 text,
  city text not null,
  postal_code text,
  phone text,
  email text,
  manager_user_id uuid,
  is_active boolean not null default true,
  created_at timestamptz not null default timezone('utc', now()),
  updated_at timestamptz not null default timezone('utc', now()),
  constraint branches_code_unique unique (code),
  constraint branches_name_not_blank check (length(trim(name)) > 0),
  constraint branches_code_not_blank check (length(trim(code)) > 0),
  constraint branches_email_format check (
    email is null or email ~* '^[^@[:space:]]+@[^@[:space:]]+\.[^@[:space:]]+$'
  )
);

create trigger branches_set_updated_at
before update on public.branches
for each row execute function public.set_updated_at();

comment on table public.branches is 'Physical dealership locations. Emirate uses the uae_emirate enum.';
