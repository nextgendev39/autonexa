-- SaaS Phase 4: public storefronts. Adds no vehicle records: a car appears on a website through a
-- flag on its existing row. Nothing is public until a dealership publishes, and no car is listed
-- until someone lists it, so applying this changes nothing anyone can see.
-- Rollback: supabase/rollbacks/00080_storefront_core_down.sql

-- ---------------------------------------------------------------------------
-- Permissions and plans
-- ---------------------------------------------------------------------------

insert into public.permissions (key, name, module, description)
values ('storefront.manage', 'Manage storefront', 'storefront', 'Edit, publish and unpublish the dealership website.')
on conflict (key) do nothing;

insert into public.role_permissions (role_id, permission_id)
select r.id, p.id
from public.roles r
cross join public.permissions p
where r.key = 'general_manager' and p.key = 'storefront.manage'
on conflict do nothing;

insert into public.platform_role_permissions (role, permission) values
  ('owner', 'storefronts.view'), ('owner', 'storefronts.manage'),
  ('admin', 'storefronts.view'), ('admin', 'storefronts.manage'),
  ('support', 'storefronts.view');

insert into public.platform_features (key, name, description, permission_modules, sort_order) values
  ('storefront', 'Public website', 'A public website for the dealership.', array['storefront'], 60),
  ('storefront_custom_domain', 'Custom domain', 'Serve the website from the dealership''s own domain.', '{}', 70),
  ('storefront_booking', 'Website booking requests', 'Let visitors request to book a car.', '{}', 80),
  ('storefront_analytics', 'Website analytics', 'Visitors, vehicle views, enquiries and conversions.', '{}', 90);

insert into public.plan_features (plan_id, feature_key, enabled)
select p.id, f.key,
  case p.key
    when 'starter' then f.key = 'storefront'
    when 'growth' then f.key in ('storefront', 'storefront_analytics')
    when 'professional' then true
    when 'enterprise' then true
    else false
  end
from public.plans p
cross join public.platform_features f
where f.key like 'storefront%';

alter table public.plans
  add column max_custom_domains integer not null default 0,
  add constraint plans_custom_domains_not_negative check (max_custom_domains is null or max_custom_domains >= 0);
alter table public.plans alter column max_custom_domains drop not null;

-- Null means unlimited, as with the other limits.
update public.plans set max_custom_domains = case key
  when 'professional' then 1
  when 'enterprise' then null
  else 0
end;

-- ---------------------------------------------------------------------------
-- Domains. Claiming a name proves nothing, so uniqueness applies only once verified: otherwise
-- whoever typed a domain first could lock its real owner out.
-- ---------------------------------------------------------------------------

alter table public.tenant_domains
  drop constraint tenant_domains_domain_unique,
  add column verification_token text not null default replace(gen_random_uuid()::text, '-', ''),
  add column verification_status text not null default 'pending',
  add column ssl_status text not null default 'pending',
  add column last_checked_at timestamptz,
  add column last_error text,
  add constraint tenant_domains_verification_status_valid check (verification_status in ('pending', 'verified', 'failed')),
  add constraint tenant_domains_ssl_status_valid check (ssl_status in ('pending', 'active', 'failed')),
  add constraint tenant_domains_tenant_domain_unique unique (tenant_id, domain);

create unique index tenant_domains_verified_unique on public.tenant_domains (domain)
  where verification_status = 'verified';

-- Being verified is a fact the server establishes from DNS, never something a user sets.
create function public.tenant_domains_guard()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  if auth.uid() is null then
    return new;
  end if;
  if tg_op = 'INSERT' then
    new.verified_at := null;
    new.verification_status := 'pending';
    new.ssl_status := 'pending';
    new.verification_token := replace(gen_random_uuid()::text, '-', '');
    new.last_checked_at := null;
    new.last_error := null;
  elsif new.domain is distinct from old.domain
     or new.tenant_id is distinct from old.tenant_id
     or new.verified_at is distinct from old.verified_at
     or new.verification_status is distinct from old.verification_status
     or new.ssl_status is distinct from old.ssl_status
     or new.verification_token is distinct from old.verification_token then
    raise exception 'domain verification cannot be changed directly' using errcode = '42501';
  end if;
  return new;
end;
$$;

revoke all on function public.tenant_domains_guard() from public, anon, authenticated;

create trigger a0_guard before insert or update on public.tenant_domains
  for each row execute function public.tenant_domains_guard();

-- Same pattern as 00079's limits: counted under a lock, for every path including the console.
create function public.guard_custom_domain_limit()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  v_status text;
  v_plan uuid;
  v_limit integer;
  v_used bigint;
begin
  select s.status, s.plan_id into v_status, v_plan
  from public.tenant_subscriptions s
  where s.tenant_id = new.tenant_id
  order by s.created_at desc, s.id
  limit 1;

  if v_status is null then
    return new;
  end if;
  if v_status in ('expired', 'cancelled') then
    raise exception 'subscription_inactive:custom_domains' using errcode = 'P0001';
  end if;
  if not public.tenant_feature_enabled(new.tenant_id, 'storefront_custom_domain') then
    raise exception 'plan_limit_exceeded:custom_domains' using errcode = 'P0001';
  end if;

  select max_custom_domains into v_limit from public.plans where id = v_plan;
  if v_limit is null then
    return new;
  end if;

  perform pg_advisory_xact_lock(hashtextextended(new.tenant_id::text || ':custom_domains', 0));
  select count(*) into v_used from public.tenant_domains where tenant_id = new.tenant_id;
  if v_used + 1 > v_limit then
    raise exception 'plan_limit_exceeded:custom_domains' using errcode = 'P0001';
  end if;
  return new;
end;
$$;

revoke all on function public.guard_custom_domain_limit() from public, anon, authenticated;

create trigger a2_plan_limit before insert on public.tenant_domains
  for each row execute function public.guard_custom_domain_limit();

-- A dealership manages its own domains. Its token is what it must publish in DNS.
grant update (is_primary) on public.tenant_domains to authenticated;

create policy tenant_domains_own_insert on public.tenant_domains for insert to authenticated
  with check (
    tenant_id = (select public.current_tenant_id())
    and (select public.has_permission('storefront.manage'))
  );
create policy tenant_domains_own_update on public.tenant_domains for update to authenticated
  using (tenant_id = (select public.current_tenant_id()) and (select public.has_permission('storefront.manage')))
  with check (tenant_id = (select public.current_tenant_id()) and (select public.has_permission('storefront.manage')));
create policy tenant_domains_own_delete on public.tenant_domains for delete to authenticated
  using (tenant_id = (select public.current_tenant_id()) and (select public.has_permission('storefront.manage')));

-- The server records what DNS and TLS showed. First verified owner of a name keeps it.
create function public.storefront_record_domain_check(
  p_domain_id uuid, p_verified boolean, p_ssl_status text, p_error text default null
)
returns boolean
language plpgsql
security definer
set search_path = public
as $$
declare
  v_row public.tenant_domains%rowtype;
begin
  select * into v_row from public.tenant_domains where id = p_domain_id for update;
  if not found then
    return false;
  end if;

  if p_verified and exists (
    select 1 from public.tenant_domains d
    where d.domain = v_row.domain and d.verification_status = 'verified' and d.id <> v_row.id
  ) then
    update public.tenant_domains
    set verification_status = 'failed', last_checked_at = now(), last_error = 'claimed_by_another'
    where id = p_domain_id;
    return false;
  end if;

  update public.tenant_domains
  set verification_status = case when p_verified then 'verified' else 'failed' end,
      verified_at = case when p_verified then coalesce(verified_at, now()) end,
      ssl_status = case when p_verified then coalesce(p_ssl_status, 'pending') else 'pending' end,
      last_checked_at = now(),
      last_error = p_error
  where id = p_domain_id;
  return p_verified;
end;
$$;

revoke all on function public.storefront_record_domain_check(uuid, boolean, text, text) from public, anon, authenticated;
grant execute on function public.storefront_record_domain_check(uuid, boolean, text, text) to service_role;

-- ---------------------------------------------------------------------------
-- Storefronts. Visitors only ever see published_config, so edits stay private until published.
-- ---------------------------------------------------------------------------

create table public.storefronts (
  tenant_id uuid primary key references public.tenants (id) on delete restrict,
  status text not null default 'draft',
  draft_config jsonb not null default '{}'::jsonb,
  published_config jsonb,
  published_at timestamptz,
  platform_disabled boolean not null default false,
  platform_disabled_reason text,
  updated_by uuid,
  created_at timestamptz not null default timezone('utc', now()),
  updated_at timestamptz not null default timezone('utc', now()),
  constraint storefronts_status_valid check (status in ('draft', 'published', 'unpublished')),
  constraint storefronts_draft_is_object check (jsonb_typeof(draft_config) = 'object'),
  constraint storefronts_published_has_config check (status <> 'published' or published_config is not null)
);

comment on table public.storefronts is
  'One website per dealership. Dealership staff may write draft_config only; the read path re-validates it.';

create trigger storefronts_set_updated_at before update on public.storefronts
for each row execute function public.set_updated_at();

create trigger platform_audit_row after insert or update on public.storefronts
  for each row execute function public.platform_audit_row();

alter table public.storefronts enable row level security;
revoke all on public.storefronts from anon, authenticated;
grant select on public.storefronts to authenticated;
-- Column grants: publishing and the platform's switch can only go through the functions below.
grant insert (tenant_id, draft_config, updated_by) on public.storefronts to authenticated;
grant update (draft_config, updated_by) on public.storefronts to authenticated;
grant all on public.storefronts to service_role;

create policy storefronts_select on public.storefronts for select to authenticated
  using (
    (tenant_id = (select public.current_tenant_id()) and (select public.has_permission('storefront.manage')))
    or (select public.has_platform_permission('storefronts.view'))
  );
create policy storefronts_own_insert on public.storefronts for insert to authenticated
  with check (tenant_id = (select public.current_tenant_id()) and (select public.has_permission('storefront.manage')));
create policy storefronts_own_update on public.storefronts for update to authenticated
  using (tenant_id = (select public.current_tenant_id()) and (select public.has_permission('storefront.manage')))
  with check (tenant_id = (select public.current_tenant_id()) and (select public.has_permission('storefront.manage')));

-- Take no ID: a dealership can only ever publish its own.
create function public.storefront_publish()
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  v_tenant uuid := public.current_tenant_id();
begin
  if v_tenant is null or not public.has_permission('storefront.manage') then
    raise exception 'not authorized' using errcode = '42501';
  end if;
  if exists (select 1 from public.storefronts where tenant_id = v_tenant and platform_disabled) then
    raise exception 'storefront_disabled' using errcode = 'P0001';
  end if;
  update public.storefronts
  set status = 'published', published_config = draft_config, published_at = now(), updated_by = auth.uid()
  where tenant_id = v_tenant;
  if not found then
    raise exception 'nothing to publish' using errcode = 'P0002';
  end if;
end;
$$;

create function public.storefront_unpublish()
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  v_tenant uuid := public.current_tenant_id();
begin
  if v_tenant is null or not public.has_permission('storefront.manage') then
    raise exception 'not authorized' using errcode = '42501';
  end if;
  update public.storefronts set status = 'unpublished', updated_by = auth.uid() where tenant_id = v_tenant;
end;
$$;

-- Platform staff can take a site down without reading anything private, and it stays down until
-- they lift it. Whether it is published is the dealership's own business and is left alone.
create function public.platform_set_storefront_disabled(p_tenant_id uuid, p_disabled boolean, p_reason text default null)
returns void
language plpgsql
security definer
set search_path = public
as $$
begin
  if not public.has_platform_permission('storefronts.manage') then
    raise exception 'not authorized' using errcode = '42501';
  end if;
  if not exists (select 1 from public.tenants where id = p_tenant_id) then
    raise exception 'tenant not found' using errcode = 'P0002';
  end if;
  insert into public.storefronts (tenant_id, platform_disabled, platform_disabled_reason)
  values (p_tenant_id, p_disabled, case when p_disabled then p_reason end)
  on conflict (tenant_id) do update
  set platform_disabled = excluded.platform_disabled,
      platform_disabled_reason = excluded.platform_disabled_reason;
  perform public.platform_log(
    case when p_disabled then 'storefront.disabled' else 'storefront.enabled' end,
    'storefronts', p_tenant_id, p_tenant_id, null, null, jsonb_build_object('reason', p_reason)
  );
end;
$$;

revoke all on function public.storefront_publish() from public, anon;
revoke all on function public.storefront_unpublish() from public, anon;
revoke all on function public.platform_set_storefront_disabled(uuid, boolean, text) from public, anon;
grant execute on function public.storefront_publish() to authenticated, service_role;
grant execute on function public.storefront_unpublish() to authenticated, service_role;
grant execute on function public.platform_set_storefront_disabled(uuid, boolean, text) to authenticated, service_role;

-- ---------------------------------------------------------------------------
-- Listing a car. A column on the existing record: there is no second copy to go stale. A constant
-- default is stored in the catalog, so no vehicle row is rewritten or audited.
-- ---------------------------------------------------------------------------

alter table public.vehicles add column storefront_published boolean not null default false;

create index vehicles_storefront_listed_idx on public.vehicles (tenant_id, status)
  where storefront_published and deleted_at is null;

create function public.vehicles_guard_storefront_published()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  if auth.uid() is not null
     and new.storefront_published is distinct from old.storefront_published
     and not public.has_permission_for_branch('storefront.manage', new.branch_id) then
    raise exception 'not authorized to change website listing' using errcode = '42501';
  end if;
  return new;
end;
$$;

revoke all on function public.vehicles_guard_storefront_published() from public, anon, authenticated;

create trigger vehicles_guard_storefront_published before update of storefront_published on public.vehicles
  for each row execute function public.vehicles_guard_storefront_published();

create function public.storefront_set_vehicle_published(p_vehicle_id uuid, p_published boolean)
returns boolean
language plpgsql
security definer
set search_path = public
as $$
declare
  v_branch uuid;
begin
  select branch_id into v_branch from public.vehicles where id = p_vehicle_id and deleted_at is null;
  if v_branch is null or not public.has_permission_for_branch('storefront.manage', v_branch) then
    raise exception 'not authorized' using errcode = '42501';
  end if;
  update public.vehicles set storefront_published = p_published where id = p_vehicle_id;
  return p_published;
end;
$$;

revoke all on function public.storefront_set_vehicle_published(uuid, boolean) from public, anon;
grant execute on function public.storefront_set_vehicle_published(uuid, boolean) to authenticated, service_role;

-- ---------------------------------------------------------------------------
-- Which dealership a host belongs to. A custom domain counts only once verified, and every
-- condition for being online is decided here, in one place.
-- ---------------------------------------------------------------------------

create function public.storefront_resolve_host(p_host text, p_base_domain text default null)
returns jsonb
language plpgsql
stable
security definer
set search_path = public
as $$
declare
  v_host text := lower(trim(p_host));
  v_tenant uuid;
  v_kind text;
  v_slug text;
  v_status text;
  v_result jsonb;
begin
  if v_host is null or v_host = '' then
    return null;
  end if;

  if p_base_domain is not null and v_host like '%.' || lower(p_base_domain) then
    v_slug := left(v_host, length(v_host) - length(p_base_domain) - 1);
    -- One label only, so a.b.base can't pass as a dealership, and never a name we keep for ourselves.
    if v_slug = '' or v_slug like '%.%' or v_slug in (
      'www', 'app', 'admin', 'api', 'platform', 'mail', 'static', 'assets', 'cdn', 'status',
      'support', 'help', 'login', 'auth', 'dashboard', 'ns1', 'ns2'
    ) then
      return null;
    end if;
    select id into v_tenant from public.tenants where slug = v_slug;
    v_kind := 'subdomain';
  else
    select d.tenant_id into v_tenant
    from public.tenant_domains d
    where d.domain = v_host and d.verification_status = 'verified' and d.verified_at is not null;
    v_kind := 'custom';
  end if;

  if v_tenant is null then
    return null;
  end if;

  select s.status into v_status
  from public.tenant_subscriptions s
  where s.tenant_id = v_tenant
  order by s.created_at desc, s.id
  limit 1;

  if v_status in ('expired', 'cancelled')
     or not public.tenant_feature_enabled(v_tenant, 'storefront')
     or (v_kind = 'custom' and not public.tenant_feature_enabled(v_tenant, 'storefront_custom_domain')) then
    return null;
  end if;

  select jsonb_build_object(
    'tenantId', t.id,
    'name', t.name,
    'slug', t.slug,
    'kind', v_kind,
    'host', v_host,
    'config', s.published_config,
    'displayName', coalesce(ts.display_name, t.name),
    'currency', coalesce(ts.currency, 'AED'),
    'defaultLocale', coalesce(ts.default_locale, 'en'),
    'bookingEnabled', public.tenant_feature_enabled(t.id, 'storefront_booking')
      and public.tenant_feature_enabled(t.id, 'bookings'),
    'analyticsEnabled', public.tenant_feature_enabled(t.id, 'storefront_analytics')
  )
  into v_result
  from public.tenants t
  join public.storefronts s on s.tenant_id = t.id
  left join public.tenant_settings ts on ts.tenant_id = t.id
  where t.id = v_tenant
    and t.status = 'active'
    and s.status = 'published'
    and not s.platform_disabled
    and s.published_config is not null;

  return v_result;
end;
$$;

revoke all on function public.storefront_resolve_host(text, text) from public, anon, authenticated;
grant execute on function public.storefront_resolve_host(text, text) to service_role;

-- ---------------------------------------------------------------------------
-- Branding files. Public by nature, and written only by the server, which chooses the path.
-- SVG is left out on purpose: it can carry script.
-- ---------------------------------------------------------------------------

insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values ('storefront-assets', 'storefront-assets', true, 5242880, array['image/jpeg', 'image/png', 'image/webp']);

-- ---------------------------------------------------------------------------
-- Nothing above is callable without logging in, trigger functions included (see 00075).
-- ---------------------------------------------------------------------------

do $$
declare
  fn record;
begin
  for fn in
    select p.oid::regprocedure as sig, has_function_privilege('authenticated', p.oid, 'execute') as for_staff
    from pg_proc p
    where p.pronamespace = 'public'::regnamespace and p.prokind = 'f'
      and has_function_privilege('anon', p.oid, 'execute')
  loop
    if fn.for_staff then
      execute format('grant execute on function %s to authenticated', fn.sig);
    end if;
    execute format('revoke execute on function %s from public, anon', fn.sig);
  end loop;
end;
$$;
