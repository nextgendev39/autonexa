-- SaaS Phase 4: what visitors can do. Everything here is callable only by the server, which has
-- already decided the dealership from the verified host. Enquiries reach the existing customers
-- table, so there is no second CRM. A visitor can't reserve a car directly, because anyone could
-- then hold a dealership's stock: they ask, and staff confirm through the existing booking flow.
-- Rollback: supabase/rollbacks/00081_storefront_public_down.sql

create table public.storefront_enquiries (
  id uuid primary key default gen_random_uuid(),
  tenant_id uuid not null references public.tenants (id) on delete restrict,
  kind text not null default 'enquiry',
  status text not null default 'new',
  vehicle_id uuid,
  branch_id uuid,
  customer_id uuid,
  reservation_id uuid,
  first_name text not null,
  last_name text not null,
  phone text not null,
  email text,
  message text,
  locale text not null default 'en',
  -- The public price when asked. Staff confirm the real one, and the booking flow checks it.
  quoted_price numeric(14, 2),
  source_host text,
  handled_by uuid,
  created_at timestamptz not null default timezone('utc', now()),
  updated_at timestamptz not null default timezone('utc', now()),
  constraint storefront_enquiries_kind_valid check (kind in ('enquiry', 'booking_request')),
  constraint storefront_enquiries_status_valid check (status in ('new', 'contacted', 'converted', 'closed')),
  constraint storefront_enquiries_vehicle_fkey foreign key (tenant_id, vehicle_id)
    references public.vehicles (tenant_id, id) on delete set null (vehicle_id),
  constraint storefront_enquiries_branch_fkey foreign key (tenant_id, branch_id)
    references public.branches (tenant_id, id) on delete set null (branch_id),
  constraint storefront_enquiries_customer_fkey foreign key (tenant_id, customer_id)
    references public.customers (tenant_id, id) on delete set null (customer_id),
  constraint storefront_enquiries_reservation_fkey foreign key (tenant_id, reservation_id)
    references public.reservations (tenant_id, id) on delete set null (reservation_id),
  constraint storefront_enquiries_handled_by_fkey foreign key (tenant_id, handled_by)
    references public.profiles (tenant_id, id) on delete set null (handled_by)
);

create index storefront_enquiries_tenant_recent_idx on public.storefront_enquiries (tenant_id, created_at desc);
create index storefront_enquiries_customer_idx on public.storefront_enquiries (customer_id);

create trigger storefront_enquiries_set_updated_at before update on public.storefront_enquiries
for each row execute function public.set_updated_at();

alter table public.storefront_enquiries enable row level security;
revoke all on public.storefront_enquiries from anon, authenticated;
grant select on public.storefront_enquiries to authenticated;
-- Staff work an enquiry. They can't rewrite what the visitor said.
grant update (status, handled_by, reservation_id) on public.storefront_enquiries to authenticated;
grant all on public.storefront_enquiries to service_role;

create policy tenant_isolation on public.storefront_enquiries as restrictive for all to authenticated
  using (tenant_id = (select public.current_tenant_id()))
  with check (tenant_id = (select public.current_tenant_id()));
create policy storefront_enquiries_select on public.storefront_enquiries for select to authenticated
  using (public.has_permission_for_optional_branch('customer.view', branch_id));
create policy storefront_enquiries_update on public.storefront_enquiries for update to authenticated
  using (public.has_permission_for_optional_branch('customer.edit', branch_id))
  with check (public.has_permission_for_optional_branch('customer.edit', branch_id));

-- Counts for analytics. visitor_hash is salted per day and per dealership, and no address is kept.
create table public.storefront_events (
  id uuid primary key default gen_random_uuid(),
  tenant_id uuid not null references public.tenants (id) on delete restrict,
  kind text not null,
  vehicle_id uuid,
  path text,
  visitor_hash text,
  referrer_host text,
  created_at timestamptz not null default timezone('utc', now()),
  constraint storefront_events_kind_valid
    check (kind in ('page_view', 'vehicle_view', 'enquiry', 'booking_request', 'conversion')),
  constraint storefront_events_vehicle_fkey foreign key (tenant_id, vehicle_id)
    references public.vehicles (tenant_id, id) on delete set null (vehicle_id)
);

create index storefront_events_tenant_recent_idx on public.storefront_events (tenant_id, created_at desc);

alter table public.storefront_events enable row level security;
revoke all on public.storefront_events from anon, authenticated;
grant all on public.storefront_events to service_role;

create policy tenant_isolation on public.storefront_events as restrictive for all to authenticated
  using (tenant_id = (select public.current_tenant_id()))
  with check (tenant_id = (select public.current_tenant_id()));

-- Held in the database because serverless instances share no memory. Keys are hashes.
create table public.storefront_rate_limits (
  key text primary key,
  hits integer not null default 0,
  window_start timestamptz not null default timezone('utc', now())
);

alter table public.storefront_rate_limits enable row level security;
revoke all on public.storefront_rate_limits from anon, authenticated;
grant all on public.storefront_rate_limits to service_role;

create function public.storefront_rate_limit(p_key text, p_max integer, p_window_seconds integer)
returns boolean
language plpgsql
security definer
set search_path = public
as $$
declare
  v_hits integer;
begin
  insert into public.storefront_rate_limits as r (key, hits, window_start)
  values (p_key, 1, now())
  on conflict (key) do update
  set hits = case
        when r.window_start <= now() - make_interval(secs => p_window_seconds) then 1
        else r.hits + 1
      end,
      window_start = case
        when r.window_start <= now() - make_interval(secs => p_window_seconds) then now()
        else r.window_start
      end
  returning hits into v_hits;

  -- Occasional tidy-up, so the table doesn't grow forever.
  if random() < 0.01 then
    delete from public.storefront_rate_limits where window_start < now() - interval '2 days';
  end if;

  return v_hits <= p_max;
end;
$$;

revoke all on function public.storefront_rate_limit(text, integer, integer) from public, anon, authenticated;
grant execute on function public.storefront_rate_limit(text, integer, integer) to service_role;

-- ---------------------------------------------------------------------------
-- Prices and booking rules
-- ---------------------------------------------------------------------------

-- What a visitor is shown. Never the minimum, which is the least the dealership will accept.
create function public.vehicle_public_price(p_vehicle_id uuid)
returns numeric
language sql
stable
security definer
set search_path = public
as $$
  select coalesce(
    nullif(v.current_selling_price, 0),
    nullif(p.advertised_price, 0),
    nullif(p.target_selling_price, 0)
  )
  from public.vehicles v
  left join public.vehicle_pricing p on p.vehicle_id = v.id
  where v.id = p_vehicle_id;
$$;

-- The server's answer to "can this car be asked for right now?". Says no without saying why to
-- visitors, because a reason would give away that the public price is under the minimum.
create function public.storefront_booking_eligibility(p_tenant_id uuid, p_vehicle_id uuid)
returns jsonb
language plpgsql
stable
security definer
set search_path = public
as $$
declare
  v public.vehicles%rowtype;
  v_price numeric;
  v_reason text;
begin
  select * into v from public.vehicles where id = p_vehicle_id and tenant_id = p_tenant_id;
  v_price := public.vehicle_public_price(p_vehicle_id);

  v_reason := case
    when v.id is null or v.deleted_at is not null then 'not_found'
    when not public.tenant_feature_enabled(p_tenant_id, 'storefront_booking')
      or not public.tenant_feature_enabled(p_tenant_id, 'bookings') then 'not_on_plan'
    when not v.storefront_published then 'not_listed'
    when v.status <> 'ready_for_sale' then 'not_available'
    when v.minimum_selling_price is null or v.minimum_selling_price <= 0 then 'no_minimum_price'
    when v_price is null then 'no_price'
    when v_price < v.minimum_selling_price then 'below_minimum'
    when exists (
      select 1 from public.reservations r where r.vehicle_id = p_vehicle_id and r.status = 'active'
    ) then 'already_booked'
  end;

  return jsonb_build_object(
    'eligible', v_reason is null,
    'reason', v_reason,
    'price', case when v_reason is null then v_price end
  );
end;
$$;

-- ---------------------------------------------------------------------------
-- Enquiries reach the CRM. A number we already know links to that customer, whose details stay as
-- they are: otherwise anyone who knew a phone number could rewrite someone's record.
-- ---------------------------------------------------------------------------

create function public.storefront_submit_enquiry(
  p_tenant_id uuid,
  p_vehicle_id uuid,
  p_kind text,
  p_first_name text,
  p_last_name text,
  p_phone text,
  p_email text default null,
  p_message text default null,
  p_locale text default 'en',
  p_host text default null,
  p_visitor_hash text default null
)
returns uuid
language plpgsql
security definer
set search_path = public
as $$
declare
  v_vehicle public.vehicles%rowtype;
  v_customer uuid;
  v_id uuid;
  v_eligibility jsonb;
  v_price numeric;
  v_title text;
begin
  if p_vehicle_id is not null then
    -- Locked so a booking request and a staff booking can't race past each other unseen.
    select * into v_vehicle from public.vehicles
    where id = p_vehicle_id and tenant_id = p_tenant_id and deleted_at is null and storefront_published
    for update;
    if not found then
      raise exception 'vehicle_not_available' using errcode = 'P0001';
    end if;
    v_title := concat_ws(' ', v_vehicle.year, v_vehicle.make, v_vehicle.model);
  end if;

  if p_kind = 'booking_request' then
    if p_vehicle_id is null then
      raise exception 'vehicle_not_available' using errcode = 'P0001';
    end if;
    v_eligibility := public.storefront_booking_eligibility(p_tenant_id, p_vehicle_id);
    if not (v_eligibility ->> 'eligible')::boolean then
      raise exception 'booking_not_eligible' using errcode = 'P0001';
    end if;
    v_price := (v_eligibility ->> 'price')::numeric;
  else
    v_price := case when p_vehicle_id is not null then public.vehicle_public_price(p_vehicle_id) end;
  end if;

  select id into v_customer from public.customers
  where tenant_id = p_tenant_id and phone = p_phone and deleted_at is null;

  if v_customer is null then
    insert into public.customers (tenant_id, customer_code, first_name, last_name, display_name, phone, email, branch_id)
    values (
      p_tenant_id,
      'WEB-' || upper(substr(replace(gen_random_uuid()::text, '-', ''), 1, 10)),
      p_first_name, p_last_name, concat_ws(' ', p_first_name, p_last_name), p_phone, p_email, v_vehicle.branch_id
    )
    on conflict (tenant_id, phone) where (deleted_at is null) do nothing
    returning id into v_customer;

    -- Two enquiries from one new number at once: the other one created it.
    if v_customer is null then
      select id into v_customer from public.customers
      where tenant_id = p_tenant_id and phone = p_phone and deleted_at is null;
    end if;
  end if;

  insert into public.storefront_enquiries (
    tenant_id, kind, vehicle_id, branch_id, customer_id, first_name, last_name, phone, email, message,
    locale, quoted_price, source_host
  )
  values (
    p_tenant_id, p_kind, p_vehicle_id, v_vehicle.branch_id, v_customer, p_first_name, p_last_name, p_phone,
    p_email, p_message, coalesce(p_locale, 'en'), v_price, p_host
  )
  returning id into v_id;

  insert into public.storefront_events (tenant_id, kind, vehicle_id, visitor_hash)
  values (p_tenant_id, case when p_kind = 'booking_request' then 'booking_request' else 'enquiry' end, p_vehicle_id, p_visitor_hash);

  insert into public.notifications (tenant_id, user_id, type, title, message, entity_type, entity_id, data)
  select
    p_tenant_id, admin_id,
    case when p_kind = 'booking_request' then 'storefront_booking_request' else 'storefront_enquiry' end,
    case when p_kind = 'booking_request' then 'Website booking request' else 'New website enquiry' end,
    coalesce(v_title, 'General enquiry'),
    'storefront_enquiry', v_id,
    jsonb_build_object('stockNumber', v_vehicle.stock_number, 'vehicleTitle', v_title)
  from public.active_super_admin_ids(p_tenant_id) as admin_id;

  return v_id;
end;
$$;

-- ---------------------------------------------------------------------------
-- Analytics. Totals only, so nothing about a visitor can be read back.
-- ---------------------------------------------------------------------------

create function public.storefront_analytics_for(p_tenant_id uuid, p_days integer)
returns jsonb
language sql
stable
security definer
set search_path = public
as $$
  with recent as (
    select * from public.storefront_events e
    where e.tenant_id = p_tenant_id
      and e.created_at >= now() - make_interval(days => greatest(least(coalesce(p_days, 30), 365), 1))
  ),
  counts as (
    select
      count(distinct visitor_hash) filter (where kind in ('page_view', 'vehicle_view')) as visitors,
      count(*) filter (where kind = 'page_view') as page_views,
      count(*) filter (where kind = 'vehicle_view') as vehicle_views,
      count(*) filter (where kind = 'enquiry') as enquiries,
      count(*) filter (where kind = 'booking_request') as booking_requests,
      count(*) filter (where kind = 'conversion') as conversions
    from recent
  )
  select jsonb_build_object(
    'visitors', c.visitors,
    'pageViews', c.page_views,
    'vehicleViews', c.vehicle_views,
    'enquiries', c.enquiries,
    'bookingRequests', c.booking_requests,
    'conversions', c.conversions,
    'topVehicles', coalesce((
      select jsonb_agg(row_to_json(top)) from (
        select v.stock_number as "stockNumber", concat_ws(' ', v.year, v.make, v.model) as title, count(*) as views
        from recent r
        join public.vehicles v on v.id = r.vehicle_id
        where r.kind = 'vehicle_view'
        group by v.stock_number, v.year, v.make, v.model
        order by count(*) desc
        limit 10
      ) top
    ), '[]'::jsonb)
  )
  from counts c;
$$;

-- A dealership's own. Takes no dealership ID.
create function public.storefront_analytics(p_days integer default 30)
returns jsonb
language plpgsql
stable
security definer
set search_path = public
as $$
declare
  v_tenant uuid := public.current_tenant_id();
begin
  if v_tenant is null
     or not public.has_permission('storefront.manage')
     or not public.tenant_feature_enabled(v_tenant, 'storefront_analytics') then
    raise exception 'not authorized' using errcode = '42501';
  end if;
  return public.storefront_analytics_for(v_tenant, p_days);
end;
$$;

-- Every dealership's site at a glance: state and counts, and nothing a dealership keeps private.
create function public.platform_storefront_overview()
returns table (
  tenant_id uuid, tenant_name text, slug text, tenant_status text, status text, published_at timestamptz,
  platform_disabled boolean, platform_disabled_reason text, domains bigint, verified_domains bigint,
  listed_vehicles bigint, visitors_30d bigint, enquiries_30d bigint
)
language plpgsql
stable
security definer
set search_path = public
as $$
begin
  if not public.has_platform_permission('storefronts.view') then
    raise exception 'not authorized' using errcode = '42501';
  end if;
  return query
    select
      t.id, t.name, t.slug, t.status, coalesce(s.status, 'draft'), s.published_at,
      coalesce(s.platform_disabled, false), s.platform_disabled_reason,
      (select count(*) from public.tenant_domains d where d.tenant_id = t.id),
      (select count(*) from public.tenant_domains d where d.tenant_id = t.id and d.verification_status = 'verified'),
      (select count(*) from public.vehicles v where v.tenant_id = t.id and v.storefront_published and v.deleted_at is null),
      (select count(distinct e.visitor_hash) from public.storefront_events e
        where e.tenant_id = t.id and e.created_at >= now() - interval '30 days'),
      (select count(*) from public.storefront_events e
        where e.tenant_id = t.id and e.kind in ('enquiry', 'booking_request') and e.created_at >= now() - interval '30 days')
    from public.tenants t
    left join public.storefronts s on s.tenant_id = t.id
    order by t.name;
end;
$$;

revoke all on function public.vehicle_public_price(uuid) from public, anon, authenticated;
revoke all on function public.storefront_booking_eligibility(uuid, uuid) from public, anon, authenticated;
revoke all on function public.storefront_submit_enquiry(uuid, uuid, text, text, text, text, text, text, text, text, text) from public, anon, authenticated;
revoke all on function public.storefront_analytics_for(uuid, integer) from public, anon, authenticated;
revoke all on function public.storefront_analytics(integer) from public, anon;
revoke all on function public.platform_storefront_overview() from public, anon;
grant execute on function public.vehicle_public_price(uuid) to service_role;
grant execute on function public.storefront_booking_eligibility(uuid, uuid) to service_role;
grant execute on function public.storefront_submit_enquiry(uuid, uuid, text, text, text, text, text, text, text, text, text) to service_role;
grant execute on function public.storefront_analytics(integer) to authenticated, service_role;
grant execute on function public.platform_storefront_overview() to authenticated, service_role;
