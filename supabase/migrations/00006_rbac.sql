-- RBAC foundation. Permission keys are the source of truth for Phase 4 RLS.

create table public.roles (
  id uuid primary key default gen_random_uuid(),
  key text not null,
  name text not null,
  description text,
  is_system boolean not null default false,
  created_at timestamptz not null default timezone('utc', now()),
  updated_at timestamptz not null default timezone('utc', now()),
  constraint roles_key_unique unique (key),
  constraint roles_key_not_blank check (length(trim(key)) > 0),
  constraint roles_name_not_blank check (length(trim(name)) > 0)
);

create table public.permissions (
  id uuid primary key default gen_random_uuid(),
  key text not null,
  name text not null,
  module text not null,
  description text,
  created_at timestamptz not null default timezone('utc', now()),
  constraint permissions_key_unique unique (key),
  constraint permissions_key_format check (key ~ '^[a-z0-9]+(\.[a-z0-9_]+)+$'),
  constraint permissions_module_not_blank check (length(trim(module)) > 0)
);

create table public.role_permissions (
  role_id uuid not null references public.roles (id) on delete cascade,
  permission_id uuid not null references public.permissions (id) on delete cascade,
  created_at timestamptz not null default timezone('utc', now()),
  primary key (role_id, permission_id)
);

create table public.user_roles (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references public.profiles (id) on delete cascade,
  role_id uuid not null references public.roles (id) on delete cascade,
  branch_id uuid references public.branches (id) on delete cascade,
  assigned_by uuid references public.profiles (id) on delete set null,
  created_at timestamptz not null default timezone('utc', now())
);

create unique index user_roles_branch_unique
  on public.user_roles (user_id, role_id, branch_id)
  where branch_id is not null;

create unique index user_roles_global_unique
  on public.user_roles (user_id, role_id)
  where branch_id is null;

create trigger roles_set_updated_at
before update on public.roles
for each row execute function public.set_updated_at();

comment on table public.roles is 'Named roles. Seeded system roles should not be deleted casually.';
comment on table public.permissions is 'Permission keys such as vehicle.view. Frontend must not invent permissions.';
comment on table public.user_roles is
  'Assigns roles to users. Optional branch_id scopes the assignment for Phase 4 RLS.';
