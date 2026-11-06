-- Storefront marketplace: what a listing says, repeat enquiries, and which cars people look at.
-- Additive only. The new columns are on the existing vehicle row with constant defaults, so no row
-- is rewritten and nothing becomes public: a car still shows only when someone lists it.
-- Rollback: supabase/rollbacks/00085_storefront_listing_details_down.sql

-- ---------------------------------------------------------------------------
-- A listing's own words. Kept apart from vehicles.description, which staff may use for internal
-- remarks: only these two columns are written for the public, and only by people who manage the site.
-- ---------------------------------------------------------------------------

alter table public.vehicles
  add column storefront_description text,
  add column storefront_features text[] not null default '{}',
  add constraint vehicles_storefront_description_length
    check (storefront_description is null or char_length(storefront_description) <= 4000),
  add constraint vehicles_storefront_features_count
    check (cardinality(storefront_features) <= 40);

comment on column public.vehicles.storefront_description is
  'Shown on the dealership website. Never internal remarks: those stay in description.';
comment on column public.vehicles.storefront_features is
  'Key features and equipment shown on the dealership website.';

-- The listing guard now covers what a listing says, not only whether it is listed.
create or replace function public.vehicles_guard_storefront_published()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  if auth.uid() is not null
     and (
       new.storefront_published is distinct from old.storefront_published
       or new.storefront_description is distinct from old.storefront_description
       or new.storefront_features is distinct from old.storefront_features
     )
     and not public.has_permission_for_branch('storefront.manage', new.branch_id) then
    raise exception 'not authorized to change website listing' using errcode = '42501';
  end if;
  return new;
end;
$$;

revoke all on function public.vehicles_guard_storefront_published() from public, anon, authenticated;

drop trigger vehicles_guard_storefront_published on public.vehicles;
create trigger vehicles_guard_storefront_published
  before update of storefront_published, storefront_description, storefront_features on public.vehicles
  for each row execute function public.vehicles_guard_storefront_published();

-- Cleans what it's given: blank lines dropped, each feature trimmed and bounded, no repeats.
create function public.storefront_set_vehicle_details(
  p_vehicle_id uuid, p_description text, p_features text[]
)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  v_branch uuid;
  v_features text[];
begin
  select branch_id into v_branch from public.vehicles where id = p_vehicle_id and deleted_at is null;
  if v_branch is null or not public.has_permission_for_branch('storefront.manage', v_branch) then
    raise exception 'not authorized' using errcode = '42501';
  end if;

  select coalesce(array_agg(feature order by first_seen), '{}')
  into v_features
  from (
    select left(trim(f), 80) as feature, min(ord) as first_seen
    from unnest(coalesce(p_features, '{}')) with ordinality as u(f, ord)
    where trim(f) <> ''
    group by left(trim(f), 80)
  ) cleaned;

  if cardinality(v_features) > 40 then
    raise exception 'too_many_features' using errcode = '22023';
  end if;

  update public.vehicles
  set storefront_description = nullif(left(trim(coalesce(p_description, '')), 4000), ''),
      storefront_features = v_features
  where id = p_vehicle_id;
end;
$$;

revoke all on function public.storefront_set_vehicle_details(uuid, text, text[]) from public, anon;
grant execute on function public.storefront_set_vehicle_details(uuid, text, text[]) to authenticated, service_role;

-- ---------------------------------------------------------------------------
-- Which listed cars people look at, for "most popular". Totals per car only, never who looked.
-- ---------------------------------------------------------------------------

create function public.storefront_vehicle_popularity(p_tenant_id uuid, p_days integer default 30)
returns table (vehicle_id uuid, views bigint)
language sql
stable
security definer
set search_path = public
as $$
  select e.vehicle_id, count(*) as views
  from public.storefront_events e
  where e.tenant_id = p_tenant_id
    and e.kind = 'vehicle_view'
    and e.vehicle_id is not null
    and e.created_at >= now() - make_interval(days => greatest(least(coalesce(p_days, 30), 365), 1))
  group by e.vehicle_id;
$$;

revoke all on function public.storefront_vehicle_popularity(uuid, integer) from public, anon, authenticated;
grant execute on function public.storefront_vehicle_popularity(uuid, integer) to service_role;

-- ---------------------------------------------------------------------------
-- Enquiries: the same person asking the same thing again within a day is one enquiry, not two.
-- The visitor gets the same answer either way, so this reveals nothing about earlier enquiries.
-- Otherwise unchanged from 00081.
-- ---------------------------------------------------------------------------

create or replace function public.storefront_submit_enquiry(
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

  -- Serialised per number, so two quick submits can't both pass the check below.
  perform pg_advisory_xact_lock(hashtextextended(p_tenant_id::text || ':enquiry:' || coalesce(p_phone, ''), 0));

  select e.id into v_id
  from public.storefront_enquiries e
  where e.tenant_id = p_tenant_id
    and e.phone = p_phone
    and e.kind = p_kind
    and e.vehicle_id is not distinct from p_vehicle_id
    and e.status in ('new', 'contacted')
    and e.created_at > now() - interval '24 hours'
  order by e.created_at desc
  limit 1;

  if v_id is not null then
    return v_id;
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

revoke all on function public.storefront_submit_enquiry(uuid, uuid, text, text, text, text, text, text, text, text, text) from public, anon, authenticated;
grant execute on function public.storefront_submit_enquiry(uuid, uuid, text, text, text, text, text, text, text, text, text) to service_role;

create index storefront_enquiries_repeat_idx
  on public.storefront_enquiries (tenant_id, phone, created_at desc);
