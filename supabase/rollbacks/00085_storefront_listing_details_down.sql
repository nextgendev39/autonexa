-- Reverses 00085. Discards what listings say on the website (public descriptions and features);
-- whether each car is listed is kept. Export them first if they matter.

drop index public.storefront_enquiries_repeat_idx;

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

drop function public.storefront_vehicle_popularity(uuid, integer);
drop function public.storefront_set_vehicle_details(uuid, text, text[]);

drop trigger vehicles_guard_storefront_published on public.vehicles;

create or replace function public.vehicles_guard_storefront_published()
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

create trigger vehicles_guard_storefront_published before update of storefront_published on public.vehicles
  for each row execute function public.vehicles_guard_storefront_published();

alter table public.vehicles
  drop constraint vehicles_storefront_features_count,
  drop constraint vehicles_storefront_description_length,
  drop column storefront_features,
  drop column storefront_description;
