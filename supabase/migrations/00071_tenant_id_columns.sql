-- SaaS Phase 1: add tenant_id to the 23 tenant-owned tables and attribute every row to
-- Zohaan Motors. A constant default is stored in the catalog, so no row is rewritten, no
-- trigger fires, and updated_at and the audit history stay exactly as they are.
-- The default then becomes resolve_insert_tenant_id() for rows written from here on.
-- profiles and audit_logs stay nullable: platform staff and platform events have no tenant.
-- Rollback: supabase/rollbacks/00071_tenant_id_columns_down.sql

alter table public.branches add column tenant_id uuid not null default '00000000-0000-4000-8000-000000000001';
alter table public.branches alter column tenant_id set default public.resolve_insert_tenant_id();
alter table public.branches add constraint branches_tenant_id_fkey foreign key (tenant_id) references public.tenants (id) on delete restrict not valid;
alter table public.branches validate constraint branches_tenant_id_fkey;
create index branches_tenant_id_idx on public.branches (tenant_id);

alter table public.branch_locations add column tenant_id uuid not null default '00000000-0000-4000-8000-000000000001';
alter table public.branch_locations alter column tenant_id set default public.resolve_insert_tenant_id();
alter table public.branch_locations add constraint branch_locations_tenant_id_fkey foreign key (tenant_id) references public.tenants (id) on delete restrict not valid;
alter table public.branch_locations validate constraint branch_locations_tenant_id_fkey;
create index branch_locations_tenant_id_idx on public.branch_locations (tenant_id);

alter table public.profiles add column tenant_id uuid not null default '00000000-0000-4000-8000-000000000001';
alter table public.profiles alter column tenant_id set default public.resolve_insert_tenant_id();
alter table public.profiles alter column tenant_id drop not null;
alter table public.profiles add constraint profiles_tenant_id_fkey foreign key (tenant_id) references public.tenants (id) on delete restrict not valid;
alter table public.profiles validate constraint profiles_tenant_id_fkey;
create index profiles_tenant_id_idx on public.profiles (tenant_id);

alter table public.user_roles add column tenant_id uuid not null default '00000000-0000-4000-8000-000000000001';
alter table public.user_roles alter column tenant_id set default public.resolve_insert_tenant_id();
alter table public.user_roles add constraint user_roles_tenant_id_fkey foreign key (tenant_id) references public.tenants (id) on delete restrict not valid;
alter table public.user_roles validate constraint user_roles_tenant_id_fkey;
create index user_roles_tenant_id_idx on public.user_roles (tenant_id);

alter table public.customers add column tenant_id uuid not null default '00000000-0000-4000-8000-000000000001';
alter table public.customers alter column tenant_id set default public.resolve_insert_tenant_id();
alter table public.customers add constraint customers_tenant_id_fkey foreign key (tenant_id) references public.tenants (id) on delete restrict not valid;
alter table public.customers validate constraint customers_tenant_id_fkey;
create index customers_tenant_id_idx on public.customers (tenant_id);

alter table public.suppliers add column tenant_id uuid not null default '00000000-0000-4000-8000-000000000001';
alter table public.suppliers alter column tenant_id set default public.resolve_insert_tenant_id();
alter table public.suppliers add constraint suppliers_tenant_id_fkey foreign key (tenant_id) references public.tenants (id) on delete restrict not valid;
alter table public.suppliers validate constraint suppliers_tenant_id_fkey;
create index suppliers_tenant_id_idx on public.suppliers (tenant_id);

alter table public.vehicles add column tenant_id uuid not null default '00000000-0000-4000-8000-000000000001';
alter table public.vehicles alter column tenant_id set default public.resolve_insert_tenant_id();
alter table public.vehicles add constraint vehicles_tenant_id_fkey foreign key (tenant_id) references public.tenants (id) on delete restrict not valid;
alter table public.vehicles validate constraint vehicles_tenant_id_fkey;
create index vehicles_tenant_id_idx on public.vehicles (tenant_id);

alter table public.vehicle_photos add column tenant_id uuid not null default '00000000-0000-4000-8000-000000000001';
alter table public.vehicle_photos alter column tenant_id set default public.resolve_insert_tenant_id();
alter table public.vehicle_photos add constraint vehicle_photos_tenant_id_fkey foreign key (tenant_id) references public.tenants (id) on delete restrict not valid;
alter table public.vehicle_photos validate constraint vehicle_photos_tenant_id_fkey;
create index vehicle_photos_tenant_id_idx on public.vehicle_photos (tenant_id);

alter table public.vehicle_expenses add column tenant_id uuid not null default '00000000-0000-4000-8000-000000000001';
alter table public.vehicle_expenses alter column tenant_id set default public.resolve_insert_tenant_id();
alter table public.vehicle_expenses add constraint vehicle_expenses_tenant_id_fkey foreign key (tenant_id) references public.tenants (id) on delete restrict not valid;
alter table public.vehicle_expenses validate constraint vehicle_expenses_tenant_id_fkey;
create index vehicle_expenses_tenant_id_idx on public.vehicle_expenses (tenant_id);

alter table public.vehicle_pricing add column tenant_id uuid not null default '00000000-0000-4000-8000-000000000001';
alter table public.vehicle_pricing alter column tenant_id set default public.resolve_insert_tenant_id();
alter table public.vehicle_pricing add constraint vehicle_pricing_tenant_id_fkey foreign key (tenant_id) references public.tenants (id) on delete restrict not valid;
alter table public.vehicle_pricing validate constraint vehicle_pricing_tenant_id_fkey;
create index vehicle_pricing_tenant_id_idx on public.vehicle_pricing (tenant_id);

alter table public.vehicle_pricing_history add column tenant_id uuid not null default '00000000-0000-4000-8000-000000000001';
alter table public.vehicle_pricing_history alter column tenant_id set default public.resolve_insert_tenant_id();
alter table public.vehicle_pricing_history add constraint vehicle_pricing_history_tenant_id_fkey foreign key (tenant_id) references public.tenants (id) on delete restrict not valid;
alter table public.vehicle_pricing_history validate constraint vehicle_pricing_history_tenant_id_fkey;
create index vehicle_pricing_history_tenant_id_idx on public.vehicle_pricing_history (tenant_id);

alter table public.vehicle_status_history add column tenant_id uuid not null default '00000000-0000-4000-8000-000000000001';
alter table public.vehicle_status_history alter column tenant_id set default public.resolve_insert_tenant_id();
alter table public.vehicle_status_history add constraint vehicle_status_history_tenant_id_fkey foreign key (tenant_id) references public.tenants (id) on delete restrict not valid;
alter table public.vehicle_status_history validate constraint vehicle_status_history_tenant_id_fkey;
create index vehicle_status_history_tenant_id_idx on public.vehicle_status_history (tenant_id);

alter table public.vehicle_share_links add column tenant_id uuid not null default '00000000-0000-4000-8000-000000000001';
alter table public.vehicle_share_links alter column tenant_id set default public.resolve_insert_tenant_id();
alter table public.vehicle_share_links add constraint vehicle_share_links_tenant_id_fkey foreign key (tenant_id) references public.tenants (id) on delete restrict not valid;
alter table public.vehicle_share_links validate constraint vehicle_share_links_tenant_id_fkey;
create index vehicle_share_links_tenant_id_idx on public.vehicle_share_links (tenant_id);

alter table public.acquisitions add column tenant_id uuid not null default '00000000-0000-4000-8000-000000000001';
alter table public.acquisitions alter column tenant_id set default public.resolve_insert_tenant_id();
alter table public.acquisitions add constraint acquisitions_tenant_id_fkey foreign key (tenant_id) references public.tenants (id) on delete restrict not valid;
alter table public.acquisitions validate constraint acquisitions_tenant_id_fkey;
create index acquisitions_tenant_id_idx on public.acquisitions (tenant_id);

alter table public.acquisition_status_history add column tenant_id uuid not null default '00000000-0000-4000-8000-000000000001';
alter table public.acquisition_status_history alter column tenant_id set default public.resolve_insert_tenant_id();
alter table public.acquisition_status_history add constraint acquisition_status_history_tenant_id_fkey foreign key (tenant_id) references public.tenants (id) on delete restrict not valid;
alter table public.acquisition_status_history validate constraint acquisition_status_history_tenant_id_fkey;
create index acquisition_status_history_tenant_id_idx on public.acquisition_status_history (tenant_id);

alter table public.reservations add column tenant_id uuid not null default '00000000-0000-4000-8000-000000000001';
alter table public.reservations alter column tenant_id set default public.resolve_insert_tenant_id();
alter table public.reservations add constraint reservations_tenant_id_fkey foreign key (tenant_id) references public.tenants (id) on delete restrict not valid;
alter table public.reservations validate constraint reservations_tenant_id_fkey;
create index reservations_tenant_id_idx on public.reservations (tenant_id);

alter table public.sales add column tenant_id uuid not null default '00000000-0000-4000-8000-000000000001';
alter table public.sales alter column tenant_id set default public.resolve_insert_tenant_id();
alter table public.sales add constraint sales_tenant_id_fkey foreign key (tenant_id) references public.tenants (id) on delete restrict not valid;
alter table public.sales validate constraint sales_tenant_id_fkey;
create index sales_tenant_id_idx on public.sales (tenant_id);

alter table public.documents add column tenant_id uuid not null default '00000000-0000-4000-8000-000000000001';
alter table public.documents alter column tenant_id set default public.resolve_insert_tenant_id();
alter table public.documents add constraint documents_tenant_id_fkey foreign key (tenant_id) references public.tenants (id) on delete restrict not valid;
alter table public.documents validate constraint documents_tenant_id_fkey;
create index documents_tenant_id_idx on public.documents (tenant_id);

alter table public.staff_documents add column tenant_id uuid not null default '00000000-0000-4000-8000-000000000001';
alter table public.staff_documents alter column tenant_id set default public.resolve_insert_tenant_id();
alter table public.staff_documents add constraint staff_documents_tenant_id_fkey foreign key (tenant_id) references public.tenants (id) on delete restrict not valid;
alter table public.staff_documents validate constraint staff_documents_tenant_id_fkey;
create index staff_documents_tenant_id_idx on public.staff_documents (tenant_id);

alter table public.notifications add column tenant_id uuid not null default '00000000-0000-4000-8000-000000000001';
alter table public.notifications alter column tenant_id set default public.resolve_insert_tenant_id();
alter table public.notifications add constraint notifications_tenant_id_fkey foreign key (tenant_id) references public.tenants (id) on delete restrict not valid;
alter table public.notifications validate constraint notifications_tenant_id_fkey;
create index notifications_tenant_id_idx on public.notifications (tenant_id);

alter table public.push_subscriptions add column tenant_id uuid not null default '00000000-0000-4000-8000-000000000001';
alter table public.push_subscriptions alter column tenant_id set default public.resolve_insert_tenant_id();
alter table public.push_subscriptions add constraint push_subscriptions_tenant_id_fkey foreign key (tenant_id) references public.tenants (id) on delete restrict not valid;
alter table public.push_subscriptions validate constraint push_subscriptions_tenant_id_fkey;
create index push_subscriptions_tenant_id_idx on public.push_subscriptions (tenant_id);

alter table public.audit_logs add column tenant_id uuid not null default '00000000-0000-4000-8000-000000000001';
alter table public.audit_logs alter column tenant_id set default public.resolve_insert_tenant_id();
alter table public.audit_logs alter column tenant_id drop not null;
alter table public.audit_logs add constraint audit_logs_tenant_id_fkey foreign key (tenant_id) references public.tenants (id) on delete restrict not valid;
alter table public.audit_logs validate constraint audit_logs_tenant_id_fkey;
create index audit_logs_tenant_id_idx on public.audit_logs (tenant_id);

alter table public.system_settings add column tenant_id uuid not null default '00000000-0000-4000-8000-000000000001';
alter table public.system_settings alter column tenant_id set default public.resolve_insert_tenant_id();
alter table public.system_settings add constraint system_settings_tenant_id_fkey foreign key (tenant_id) references public.tenants (id) on delete restrict not valid;
alter table public.system_settings validate constraint system_settings_tenant_id_fkey;
create index system_settings_tenant_id_idx on public.system_settings (tenant_id);

-- A row belongs to the same dealership as its parent. Code running without a user session
-- (sweeps, service-role paths) therefore cannot put a child row in the wrong dealership,
-- and a stated tenant that disagrees with the parent is an error, never silently corrected.
-- Named a0_ so it runs before the triggers that assign record numbers from the tenant.
create function public.tenant_from_parent()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  v_parent_tenant uuid;
  v_parent_id uuid := (to_jsonb(new) ->> tg_argv[1])::uuid;
begin
  if v_parent_id is null then
    return new;
  end if;

  execute format('select tenant_id from public.%I where id = $1', tg_argv[0])
    into v_parent_tenant
    using v_parent_id;

  if v_parent_tenant is null then
    return new;
  end if;

  -- The only caller allowed to re-home a row: a browser's push endpoint moves with its user.
  if tg_nargs = 3 and tg_argv[2] = 'follow' then
    new.tenant_id := v_parent_tenant;
  elsif new.tenant_id is null then
    new.tenant_id := v_parent_tenant;
  elsif new.tenant_id <> v_parent_tenant then
    raise exception 'tenant mismatch on %: row and parent belong to different dealerships', tg_table_name
      using errcode = '23503';
  end if;

  return new;
end;
$$;

revoke all on function public.tenant_from_parent() from public, anon, authenticated;

create trigger a0_tenant_from_parent before insert on public.acquisition_status_history
  for each row execute function public.tenant_from_parent('acquisitions', 'acquisition_id');
create trigger a0_tenant_from_parent before insert on public.acquisitions
  for each row execute function public.tenant_from_parent('vehicles', 'vehicle_id');
create trigger a0_tenant_from_parent before insert on public.branch_locations
  for each row execute function public.tenant_from_parent('branches', 'branch_id');
create trigger a0_tenant_from_parent before insert on public.documents
  for each row execute function public.tenant_from_parent('branches', 'branch_id');
create trigger a0_tenant_from_parent before insert on public.notifications
  for each row execute function public.tenant_from_parent('profiles', 'user_id');
create trigger a0_tenant_from_parent before insert or update of user_id on public.push_subscriptions
  for each row execute function public.tenant_from_parent('profiles', 'user_id', 'follow');
create trigger a0_tenant_from_parent before insert on public.reservations
  for each row execute function public.tenant_from_parent('vehicles', 'vehicle_id');
create trigger a0_tenant_from_parent before insert on public.sales
  for each row execute function public.tenant_from_parent('vehicles', 'vehicle_id');
create trigger a0_tenant_from_parent before insert on public.staff_documents
  for each row execute function public.tenant_from_parent('profiles', 'user_id');
create trigger a0_tenant_from_parent before insert on public.user_roles
  for each row execute function public.tenant_from_parent('profiles', 'user_id');
create trigger a0_tenant_from_parent before insert on public.vehicle_expenses
  for each row execute function public.tenant_from_parent('vehicles', 'vehicle_id');
create trigger a0_tenant_from_parent before insert on public.vehicle_photos
  for each row execute function public.tenant_from_parent('vehicles', 'vehicle_id');
create trigger a0_tenant_from_parent before insert on public.vehicle_pricing
  for each row execute function public.tenant_from_parent('vehicles', 'vehicle_id');
create trigger a0_tenant_from_parent before insert on public.vehicle_pricing_history
  for each row execute function public.tenant_from_parent('vehicles', 'vehicle_id');
create trigger a0_tenant_from_parent before insert on public.vehicle_share_links
  for each row execute function public.tenant_from_parent('vehicles', 'vehicle_id');
create trigger a0_tenant_from_parent before insert on public.vehicle_status_history
  for each row execute function public.tenant_from_parent('vehicles', 'vehicle_id');
create trigger a0_tenant_from_parent before insert on public.vehicles
  for each row execute function public.tenant_from_parent('branches', 'branch_id');

-- profiles.tenant_id and tenant_members stay in step while one person has one dealership.
-- This also keeps invitations working from the app version deployed before tenancy.
create function public.sync_profile_membership()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  delete from public.tenant_members
  where user_id = new.id
    and tenant_id is distinct from new.tenant_id;

  if new.tenant_id is not null then
    insert into public.tenant_members (tenant_id, user_id, status)
    values (new.tenant_id, new.id, 'active')
    on conflict do nothing;
  end if;

  return new;
end;
$$;

revoke all on function public.sync_profile_membership() from public, anon, authenticated;

create trigger profiles_sync_membership
after insert or update of tenant_id on public.profiles
for each row execute function public.sync_profile_membership();
