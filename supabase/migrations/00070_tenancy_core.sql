-- SaaS Phase 1: tenancy core. Additive only; nothing reads these tables yet.
-- Registers Zohaan Motors as the first tenant and gives every existing profile a membership.
-- Rollback: supabase/rollbacks/00070_tenancy_core_down.sql

create table public.tenants (
  id uuid primary key default gen_random_uuid(),
  name text not null,
  slug text not null,
  status text not null default 'active',
  number_prefix text not null,
  created_at timestamptz not null default timezone('utc', now()),
  updated_at timestamptz not null default timezone('utc', now()),
  constraint tenants_slug_unique unique (slug),
  constraint tenants_name_not_blank check (length(trim(name)) > 0),
  constraint tenants_slug_format check (slug ~ '^[a-z0-9]+(-[a-z0-9]+)*$'),
  constraint tenants_status_valid check (status in ('active', 'suspended')),
  constraint tenants_number_prefix_format check (number_prefix ~ '^[A-Z0-9]{2,8}$')
);

comment on table public.tenants is
  'Dealerships. Created and changed only by privileged platform code.';

create trigger tenants_set_updated_at
before update on public.tenants
for each row execute function public.set_updated_at();

-- A person belongs to one dealership at a time for now (see the partial unique index).
-- Removing that index later allows several, with no change to the active-tenant contract.
create table public.tenant_members (
  id uuid primary key default gen_random_uuid(),
  tenant_id uuid not null references public.tenants (id) on delete restrict,
  user_id uuid not null references public.profiles (id) on delete cascade,
  status text not null default 'active',
  created_at timestamptz not null default timezone('utc', now()),
  constraint tenant_members_tenant_user_unique unique (tenant_id, user_id),
  constraint tenant_members_status_valid check (status in ('active', 'suspended'))
);

create unique index tenant_members_one_active_per_user
  on public.tenant_members (user_id)
  where status = 'active';

comment on table public.tenant_members is
  'Source of truth for which dealership a logged-in user is acting in.';

-- Platform staff run AutoNexa itself. Being listed here grants no dealership data access.
create table public.platform_admins (
  user_id uuid primary key references auth.users (id) on delete cascade,
  created_at timestamptz not null default timezone('utc', now())
);

comment on table public.platform_admins is
  'AutoNexa platform staff. No client policies; check with is_platform_admin().';

-- Per-dealership record numbering. Replaces the global sequences, which stay in place unused.
create table public.tenant_counters (
  tenant_id uuid not null references public.tenants (id) on delete restrict,
  key text not null,
  value bigint not null default 0,
  primary key (tenant_id, key)
);

comment on table public.tenant_counters is
  'Last issued record number per dealership. Changed only by next_tenant_number().';

-- The fixed ID lets later migrations backfill without looking it up.
insert into public.tenants (id, name, slug, status, number_prefix)
values ('00000000-0000-4000-8000-000000000001', 'Zohaan Motors', 'zohaan-motors', 'active', 'ZM');

insert into public.tenant_members (tenant_id, user_id, status)
select '00000000-0000-4000-8000-000000000001', p.id, 'active'
from public.profiles p;

-- Numbers continue from where the old sequences stopped, so none are ever reused.
insert into public.tenant_counters (tenant_id, key, value)
select '00000000-0000-4000-8000-000000000001'::uuid, 'vehicle_stock',
  case when is_called then last_value else 0 end
from public.vehicle_stock_number_seq
union all
select '00000000-0000-4000-8000-000000000001'::uuid, 'acquisition',
  case when is_called then last_value else 0 end
from public.acquisition_number_seq;

-- The only way the app learns the active tenant. It reads no JWT claim, header or setting,
-- so nothing a client sends can influence it, and removing a member takes effect at once.
create function public.current_tenant_id()
returns uuid
language sql
stable
security definer
set search_path = public
as $$
  select m.tenant_id
  from public.tenant_members m
  join public.tenants t on t.id = m.tenant_id
  where m.user_id = auth.uid()
    and m.status = 'active'
    and t.status = 'active'
  limit 1;
$$;

create function public.is_platform_admin()
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select exists (select 1 from public.platform_admins pa where pa.user_id = auth.uid());
$$;

-- Default for tenant_id while old code that sends no tenant is still deployed. The fallback
-- applies only while exactly one tenant exists: it switches itself off when a second
-- dealership is added, so an unattributed row fails instead of landing in the wrong place.
create function public.resolve_insert_tenant_id()
returns uuid
language sql
stable
security definer
set search_path = public
as $$
  select coalesce(
    public.current_tenant_id(),
    (select min(t.id::text)::uuid from public.tenants t having count(*) = 1)
  );
$$;

revoke all on function public.current_tenant_id() from public, anon;
revoke all on function public.is_platform_admin() from public, anon;
revoke all on function public.resolve_insert_tenant_id() from public, anon;
grant execute on function public.current_tenant_id() to authenticated, service_role;
grant execute on function public.is_platform_admin() to authenticated, service_role;
grant execute on function public.resolve_insert_tenant_id() to authenticated, service_role;

alter table public.tenants enable row level security;
alter table public.tenant_members enable row level security;
alter table public.platform_admins enable row level security;
alter table public.tenant_counters enable row level security;

revoke all on public.tenants, public.tenant_members, public.platform_admins, public.tenant_counters
  from anon, authenticated;
grant select on public.tenants, public.tenant_members to authenticated;
grant all on public.tenants, public.tenant_members, public.platform_admins, public.tenant_counters
  to service_role;

create policy tenants_select_own on public.tenants
  for select to authenticated
  using (id = (select public.current_tenant_id()));

create policy tenant_members_select_own_tenant on public.tenant_members
  for select to authenticated
  using (tenant_id = (select public.current_tenant_id()));
