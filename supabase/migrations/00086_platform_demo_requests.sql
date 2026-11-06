-- Demo requests from the public landing page, kept so the platform team can follow each one up
-- instead of relying on an inbox. Visitors never reach the table: the landing route writes it with
-- the service role. Platform staff read it and move each request along through the functions below.
-- Applying this changes no existing row.
-- Rollback: supabase/rollbacks/00086_platform_demo_requests_down.sql

insert into public.platform_role_permissions (role, permission) values
  ('owner', 'demo_requests.view'), ('owner', 'demo_requests.manage'),
  ('admin', 'demo_requests.view'), ('admin', 'demo_requests.manage'),
  ('support', 'demo_requests.view');

create table public.demo_requests (
  id uuid primary key default gen_random_uuid(),
  name text not null,
  dealership text,
  phone text,
  email text,
  stock text,
  notes text,
  locale text,
  status text not null default 'new',
  -- The dealership this request became, once someone links it.
  tenant_id uuid references public.tenants (id) on delete set null,
  staff_notes text,
  email_sent boolean not null default false,
  status_changed_at timestamptz,
  updated_by uuid,
  created_at timestamptz not null default timezone('utc', now()),
  updated_at timestamptz not null default timezone('utc', now()),
  constraint demo_requests_status_valid
    check (status in ('new', 'contacted', 'demo_booked', 'converted', 'lost')),
  constraint demo_requests_contact_present check (coalesce(phone, '') <> '' or coalesce(email, '') <> ''),
  constraint demo_requests_lengths check (
    char_length(name) between 1 and 120
    and char_length(coalesce(dealership, '')) <= 160
    and char_length(coalesce(phone, '')) <= 40
    and char_length(coalesce(email, '')) <= 160
    and char_length(coalesce(stock, '')) <= 40
    and char_length(coalesce(notes, '')) <= 2000
    and char_length(coalesce(staff_notes, '')) <= 4000
  )
);

comment on table public.demo_requests is
  'Demo requests from the landing page. Written by the service role only; platform staff read and update them through platform_* functions.';

create index demo_requests_created_at_idx on public.demo_requests (created_at desc);
create index demo_requests_email_idx on public.demo_requests (lower(email)) where email is not null;
create index demo_requests_tenant_id_idx on public.demo_requests (tenant_id) where tenant_id is not null;

alter table public.demo_requests enable row level security;
revoke all on public.demo_requests from anon, authenticated;
grant select on public.demo_requests to authenticated;
grant all on public.demo_requests to service_role;

create policy demo_requests_select on public.demo_requests for select to authenticated
  using ((select public.has_platform_permission('demo_requests.view')));

-- Every request with whether its email already belongs to a login, and to which dealership. Staff
-- can't read auth.users, so this is the only place that match is made.
create function public.platform_demo_requests()
returns table (
  id uuid, name text, dealership text, phone text, email text, stock text, notes text, locale text,
  status text, tenant_id uuid, tenant_name text, staff_notes text, email_sent boolean,
  status_changed_at timestamptz, created_at timestamptz, updated_at timestamptz,
  account_user_id uuid, account_tenant_id uuid, account_tenant_name text, account_last_sign_in_at timestamptz
)
language plpgsql
stable
security definer
set search_path = public
as $$
begin
  if not public.has_platform_permission('demo_requests.view') then
    raise exception 'not authorized' using errcode = '42501';
  end if;
  return query
    select
      r.id, r.name, r.dealership, r.phone, r.email, r.stock, r.notes, r.locale,
      r.status, r.tenant_id, t.name, r.staff_notes, r.email_sent,
      r.status_changed_at, r.created_at, r.updated_at,
      u.id, m.tenant_id, mt.name, u.last_sign_in_at
    from public.demo_requests r
    left join public.tenants t on t.id = r.tenant_id
    left join lateral (
      select au.id, au.last_sign_in_at from auth.users au
      where r.email is not null and lower(au.email) = lower(r.email)
      limit 1
    ) u on true
    left join lateral (
      select tm.tenant_id from public.tenant_members tm
      where tm.user_id = u.id and tm.status = 'active'
      limit 1
    ) m on true
    left join public.tenants mt on mt.id = m.tenant_id
    order by r.created_at desc
    limit 1000;
end;
$$;

-- Moves a request along. Null leaves a field as it is; an empty string clears the notes, and
-- p_clear_tenant unlinks the dealership.
create function public.platform_update_demo_request(
  p_id uuid,
  p_status text default null,
  p_staff_notes text default null,
  p_tenant_id uuid default null,
  p_clear_tenant boolean default false
)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  v_old public.demo_requests;
  v_new public.demo_requests;
begin
  if not public.has_platform_permission('demo_requests.manage') then
    raise exception 'not authorized' using errcode = '42501';
  end if;
  select * into v_old from public.demo_requests where id = p_id for update;
  if not found then
    raise exception 'demo request not found' using errcode = 'P0002';
  end if;
  if p_tenant_id is not null and not exists (select 1 from public.tenants where id = p_tenant_id) then
    raise exception 'tenant not found' using errcode = 'P0002';
  end if;

  update public.demo_requests
  set status = coalesce(p_status, status),
      status_changed_at = case when p_status is not null and p_status <> status then now() else status_changed_at end,
      staff_notes = case when p_staff_notes is null then staff_notes else nullif(btrim(p_staff_notes), '') end,
      tenant_id = case when p_clear_tenant then null else coalesce(p_tenant_id, tenant_id) end,
      updated_by = auth.uid(),
      updated_at = now()
  where id = p_id
  returning * into v_new;

  perform public.platform_log(
    'demo_request.updated', 'demo_requests', p_id, v_new.tenant_id,
    jsonb_build_object('status', v_old.status, 'tenant_id', v_old.tenant_id),
    jsonb_build_object('status', v_new.status, 'tenant_id', v_new.tenant_id),
    '{}'::jsonb
  );
end;
$$;

revoke all on function public.platform_demo_requests() from public, anon;
revoke all on function public.platform_update_demo_request(uuid, text, text, uuid, boolean) from public, anon;
grant execute on function public.platform_demo_requests() to authenticated, service_role;
grant execute on function public.platform_update_demo_request(uuid, text, text, uuid, boolean) to authenticated, service_role;
