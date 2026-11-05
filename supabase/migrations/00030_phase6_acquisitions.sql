-- Phase 6: Vehicle Acquisition Management.
-- Evolves Phase 3 acquisitions; expenses remain on vehicle_expenses (no duplicate ledger).

-- ---------------------------------------------------------------------------
-- Enums
-- ---------------------------------------------------------------------------

do $$ begin
  create type public.acquisition_source_type as enum (
    'individual_owner',
    'dealer',
    'auction',
    'trade_in',
    'fleet',
    'importer',
    'company',
    'broker',
    'other'
  );
exception when duplicate_object then null; end $$;

do $$ begin
  create type public.acquisition_document_status as enum (
    'pending',
    'partial',
    'complete'
  );
exception when duplicate_object then null; end $$;

do $$ begin
  create type public.acquisition_registration_status as enum (
    'not_started',
    'in_progress',
    'completed',
    'not_required'
  );
exception when duplicate_object then null; end $$;

do $$ begin
  create type public.acquisition_payment_status as enum (
    'not_paid',
    'partially_paid',
    'paid'
  );
exception when duplicate_object then null; end $$;

-- Expand expense categories for acquisition line items (unified vehicle_expenses ledger).
do $$ begin
  alter type public.vehicle_expense_category add value if not exists 'broker_fee';
exception when others then null; end $$;
do $$ begin
  alter type public.vehicle_expense_category add value if not exists 'import_duty';
exception when others then null; end $$;
do $$ begin
  alter type public.vehicle_expense_category add value if not exists 'clearance';
exception when others then null; end $$;
do $$ begin
  alter type public.vehicle_expense_category add value if not exists 'insurance';
exception when others then null; end $$;

-- Replace acquisition_status with the Phase 6 workflow set.
do $$
begin
  if not exists (
    select 1 from pg_type t
    join pg_namespace n on n.oid = t.typnamespace
    where n.nspname = 'public' and t.typname = 'acquisition_status_v2'
  ) then
    create type public.acquisition_status_v2 as enum (
      'draft',
      'sourcing',
      'negotiating',
      'pending_approval',
      'approved',
      'purchased',
      'documents_pending',
      'received',
      'cancelled',
      'rejected'
    );
  end if;
end $$;

alter table public.acquisitions
  alter column status drop default;

alter table public.acquisitions
  alter column status type public.acquisition_status_v2
  using (
    case status::text
      when 'pending' then 'pending_approval'
      when 'completed' then 'received'
      when 'draft' then 'draft'
      when 'cancelled' then 'cancelled'
      when 'sourcing' then 'sourcing'
      when 'negotiating' then 'negotiating'
      when 'pending_approval' then 'pending_approval'
      when 'approved' then 'approved'
      when 'purchased' then 'purchased'
      when 'documents_pending' then 'documents_pending'
      when 'received' then 'received'
      when 'rejected' then 'rejected'
      else 'draft'
    end
  )::public.acquisition_status_v2;

drop type if exists public.acquisition_status;

alter type public.acquisition_status_v2 rename to acquisition_status;

alter table public.acquisitions
  alter column status set default 'draft'::public.acquisition_status;

-- ---------------------------------------------------------------------------
-- Acquisition column extensions
-- ---------------------------------------------------------------------------

alter table public.acquisitions
  add column if not exists acquisition_number text,
  add column if not exists source_type public.acquisition_source_type,
  add column if not exists source_name text,
  add column if not exists source_company text,
  add column if not exists source_phone text,
  add column if not exists source_email text,
  add column if not exists source_reference text,
  add column if not exists lot_number text,
  add column if not exists customer_id uuid references public.customers (id) on delete set null,
  add column if not exists asking_price numeric(14, 2),
  add column if not exists expected_arrival_date date,
  add column if not exists received_date date,
  add column if not exists payment_status public.acquisition_payment_status not null default 'not_paid',
  add column if not exists registration_status public.acquisition_registration_status not null default 'not_started',
  add column if not exists document_status public.acquisition_document_status not null default 'pending',
  add column if not exists approved_by uuid references public.profiles (id) on delete set null,
  add column if not exists approved_at timestamptz,
  add column if not exists approval_note text,
  add column if not exists rejected_by uuid references public.profiles (id) on delete set null,
  add column if not exists rejected_at timestamptz,
  add column if not exists rejection_reason text,
  add column if not exists cancelled_at timestamptz,
  add column if not exists cancel_reason text;

-- Migrate legacy vehicle_source → acquisition_source_type when present.
do $$
begin
  if exists (
    select 1 from information_schema.columns
    where table_schema = 'public'
      and table_name = 'acquisitions'
      and column_name = 'source'
  ) then
    update public.acquisitions
    set source_type = case source::text
      when 'auction' then 'auction'::public.acquisition_source_type
      when 'trade_in' then 'trade_in'::public.acquisition_source_type
      when 'import' then 'importer'::public.acquisition_source_type
      when 'direct_purchase' then 'individual_owner'::public.acquisition_source_type
      else 'other'::public.acquisition_source_type
    end
    where source_type is null;

    alter table public.acquisitions drop column source;
  end if;
end $$;

update public.acquisitions
set source_type = 'other'::public.acquisition_source_type
where source_type is null;

alter table public.acquisitions
  alter column source_type set not null;

do $$ begin
  alter table public.acquisitions
    add constraint acquisitions_asking_price_non_negative
    check (asking_price is null or asking_price >= 0);
exception when duplicate_object then null; end $$;

do $$ begin
  alter table public.acquisitions
    add constraint acquisitions_arrival_after_purchase
    check (
      expected_arrival_date is null
      or purchase_date is null
      or expected_arrival_date >= purchase_date
    );
exception when duplicate_object then null; end $$;

do $$ begin
  alter table public.acquisitions
    add constraint acquisitions_source_email_format
    check (
      source_email is null
      or source_email ~* '^[^@[:space:]]+@[^@[:space:]]+\.[^@[:space:]]+$'
    );
exception when duplicate_object then null; end $$;

-- One active acquisition per vehicle (cancelled/rejected excluded).
create unique index if not exists acquisitions_one_active_per_vehicle
  on public.acquisitions (vehicle_id)
  where status not in ('cancelled', 'rejected');

create index if not exists acquisitions_source_type_idx on public.acquisitions (source_type);
create index if not exists acquisitions_purchase_date_idx on public.acquisitions (purchase_date);
create index if not exists acquisitions_created_at_idx on public.acquisitions (created_at);
create index if not exists acquisitions_customer_id_idx on public.acquisitions (customer_id);
create index if not exists acquisitions_supplier_id_idx on public.acquisitions (supplier_id);
create index if not exists acquisitions_payment_status_idx on public.acquisitions (payment_status);
create index if not exists acquisitions_document_status_idx on public.acquisitions (document_status);

-- ---------------------------------------------------------------------------
-- Acquisition number generation (ZM-ACQ-000001) — race-safe sequence
-- ---------------------------------------------------------------------------

create sequence if not exists public.acquisition_number_seq;

create or replace function public.next_acquisition_number()
returns text
language plpgsql
security definer
set search_path = public
as $$
declare
  n bigint;
begin
  n := nextval('public.acquisition_number_seq');
  return 'ZM-ACQ-' || lpad(n::text, 6, '0');
end;
$$;

revoke all on function public.next_acquisition_number() from public;
grant execute on function public.next_acquisition_number() to authenticated, service_role;

create or replace function public.acquisitions_assign_number()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  if new.acquisition_number is null or length(trim(new.acquisition_number)) = 0 then
    new.acquisition_number := public.next_acquisition_number();
  end if;
  return new;
end;
$$;

drop trigger if exists acquisitions_assign_number on public.acquisitions;
create trigger acquisitions_assign_number
before insert on public.acquisitions
for each row execute function public.acquisitions_assign_number();

-- Backfill existing rows then enforce uniqueness / NOT NULL.
do $$
declare
  r record;
  max_n bigint;
begin
  for r in
    select id from public.acquisitions
    where acquisition_number is null or length(trim(acquisition_number)) = 0
    order by created_at, id
  loop
    update public.acquisitions
    set acquisition_number = public.next_acquisition_number()
    where id = r.id;
  end loop;

  select coalesce(max(
    case
      when acquisition_number ~ '^ZM-ACQ-[0-9]+$'
        then substring(acquisition_number from 8)::bigint
      else 0
    end
  ), 0)
  into max_n
  from public.acquisitions;

  if max_n > 0 then
    perform setval('public.acquisition_number_seq', max_n, true);
  end if;
end $$;

alter table public.acquisitions
  alter column acquisition_number set not null;

create unique index if not exists acquisitions_acquisition_number_unique
  on public.acquisitions (acquisition_number);

-- ---------------------------------------------------------------------------
-- Status history
-- ---------------------------------------------------------------------------

create table if not exists public.acquisition_status_history (
  id uuid primary key default gen_random_uuid(),
  acquisition_id uuid not null references public.acquisitions (id) on delete cascade,
  old_status public.acquisition_status,
  new_status public.acquisition_status not null,
  reason text,
  changed_by uuid references public.profiles (id) on delete set null,
  created_at timestamptz not null default timezone('utc', now())
);

create index if not exists acquisition_status_history_acquisition_id_idx
  on public.acquisition_status_history (acquisition_id, created_at desc);

alter table public.acquisition_status_history enable row level security;

-- ---------------------------------------------------------------------------
-- Status transition rules
-- ---------------------------------------------------------------------------

create or replace function public.is_valid_acquisition_status_transition(
  p_from public.acquisition_status,
  p_to public.acquisition_status
)
returns boolean
language sql
immutable
as $$
  select case
    when p_from is null then true
    when p_from = p_to then true
    when p_from = 'draft' and p_to in ('sourcing', 'cancelled') then true
    when p_from = 'sourcing' and p_to in ('negotiating', 'cancelled') then true
    when p_from = 'negotiating' and p_to in ('pending_approval', 'cancelled') then true
    when p_from = 'pending_approval' and p_to in ('approved', 'rejected') then true
    when p_from = 'approved' and p_to in ('purchased', 'cancelled', 'pending_approval') then true
    when p_from = 'purchased' and p_to in ('documents_pending', 'received') then true
    when p_from = 'documents_pending' and p_to = 'received' then true
    when p_from = 'rejected' and p_to in ('negotiating', 'cancelled') then true
    else false
  end;
$$;

create or replace function public.enforce_acquisition_status_transition()
returns trigger
language plpgsql
as $$
begin
  if tg_op = 'UPDATE'
     and new.status is distinct from old.status
     and not public.is_valid_acquisition_status_transition(old.status, new.status) then
    raise exception 'invalid acquisition status transition from % to %', old.status, new.status
      using errcode = 'check_violation';
  end if;
  return new;
end;
$$;

drop trigger if exists acquisitions_enforce_status_transition on public.acquisitions;
create trigger acquisitions_enforce_status_transition
before update of status on public.acquisitions
for each row execute function public.enforce_acquisition_status_transition();

create or replace function public.track_acquisition_status_change()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  v_reason text;
begin
  v_reason := nullif(current_setting('app.acquisition_status_reason', true), '');

  if tg_op = 'UPDATE' and new.status is distinct from old.status then
    insert into public.acquisition_status_history (
      acquisition_id, old_status, new_status, reason, changed_by
    )
    values (
      new.id,
      old.status,
      new.status,
      coalesce(v_reason, 'status_change'),
      auth.uid()
    );
  elsif tg_op = 'INSERT' then
    insert into public.acquisition_status_history (
      acquisition_id, old_status, new_status, reason, changed_by
    )
    values (
      new.id,
      null,
      new.status,
      coalesce(v_reason, 'created'),
      auth.uid()
    );
  end if;
  return new;
end;
$$;

drop trigger if exists acquisitions_track_status_change on public.acquisitions;
create trigger acquisitions_track_status_change
after insert or update of status on public.acquisitions
for each row execute function public.track_acquisition_status_change();

-- Configurable self-approval rule (default: disallow).
create or replace function public.acquisition_allows_self_approval()
returns boolean
language sql
stable
as $$
  select false;
$$;

-- Map acquisition source → vehicle inventory source.
create or replace function public.map_acquisition_source_to_vehicle_source(
  p_source public.acquisition_source_type
)
returns public.vehicle_source
language sql
immutable
as $$
  select case p_source
    when 'auction' then 'auction'::public.vehicle_source
    when 'trade_in' then 'trade_in'::public.vehicle_source
    when 'importer' then 'import'::public.vehicle_source
    when 'individual_owner' then 'direct_purchase'::public.vehicle_source
    when 'dealer' then 'direct_purchase'::public.vehicle_source
    when 'company' then 'direct_purchase'::public.vehicle_source
    when 'fleet' then 'direct_purchase'::public.vehicle_source
    when 'broker' then 'other'::public.vehicle_source
    else 'other'::public.vehicle_source
  end;
$$;

-- ---------------------------------------------------------------------------
-- Financial helpers
-- ---------------------------------------------------------------------------

create or replace function public.acquisition_expense_sum(p_acquisition_id uuid)
returns numeric
language sql
stable
security definer
set search_path = public
as $$
  select coalesce(sum(amount), 0)::numeric(14, 2)
  from public.vehicle_expenses
  where acquisition_id = p_acquisition_id
    and category is distinct from 'purchase';
$$;

create or replace function public.acquisition_total_cost(p_acquisition_id uuid)
returns numeric
language sql
stable
security definer
set search_path = public
as $$
  select (
    coalesce((select purchase_price from public.acquisitions where id = p_acquisition_id), 0)
    + public.acquisition_expense_sum(p_acquisition_id)
  )::numeric(14, 2);
$$;

create or replace function public.read_acquisition_costs(p_acquisition_id uuid)
returns table (
  asking_price numeric,
  purchase_price numeric,
  expense_total numeric,
  total_acquisition_cost numeric
)
language plpgsql
stable
security definer
set search_path = public
as $$
declare
  v_branch uuid;
begin
  select a.branch_id into v_branch
  from public.acquisitions a
  where a.id = p_acquisition_id;

  if v_branch is null then
    return;
  end if;

  if not public.has_permission_for_branch('acquisition.cost.view', v_branch)
     and not public.has_permission_for_branch('vehicle.cost.view', v_branch) then
    raise exception 'not authorized';
  end if;

  return query
  select
    a.asking_price,
    a.purchase_price,
    public.acquisition_expense_sum(a.id),
    public.acquisition_total_cost(a.id)
  from public.acquisitions a
  where a.id = p_acquisition_id;
end;
$$;

create or replace function public.read_acquisitions_costs(p_ids uuid[])
returns table (
  acquisition_id uuid,
  asking_price numeric,
  purchase_price numeric,
  expense_total numeric,
  total_acquisition_cost numeric
)
language plpgsql
stable
security definer
set search_path = public
as $$
begin
  return query
  select
    a.id,
    a.asking_price,
    a.purchase_price,
    public.acquisition_expense_sum(a.id),
    public.acquisition_total_cost(a.id)
  from public.acquisitions a
  where a.id = any (p_ids)
    and (
      public.has_permission_for_branch('acquisition.cost.view', a.branch_id)
      or public.has_permission_for_branch('vehicle.cost.view', a.branch_id)
    );
end;
$$;

-- Withhold sensitive money columns from direct SELECT (mirror vehicles pattern).
do $$
begin
  revoke select (asking_price, purchase_price) on public.acquisitions from authenticated;
exception when undefined_object then
  raise notice 'Skipping acquisition cost column revoke (role/grants not present yet)';
end $$;

-- ---------------------------------------------------------------------------
-- Secure RPCs
-- ---------------------------------------------------------------------------

create or replace function public.change_acquisition_status(
  p_acquisition_id uuid,
  p_new_status public.acquisition_status,
  p_reason text default null
)
returns public.acquisitions
language plpgsql
security definer
set search_path = public
as $$
declare
  v_row public.acquisitions%rowtype;
  v_old public.acquisition_status;
begin
  select * into v_row
  from public.acquisitions
  where id = p_acquisition_id
  for update;

  if not found then
    raise exception 'acquisition not found';
  end if;

  if not public.has_permission_for_branch('acquisition.edit', v_row.branch_id) then
    raise exception 'not authorized';
  end if;

  if p_new_status in ('cancelled', 'rejected', 'approved') then
    raise exception 'use dedicated approve/reject/cancel operations';
  end if;

  if p_new_status = 'purchased' then
    raise exception 'use confirm_acquisition_purchase';
  end if;

  if p_new_status = 'received' then
    raise exception 'use receive_acquisition';
  end if;

  if p_reason is null or length(trim(p_reason)) = 0 then
    raise exception 'reason required';
  end if;

  v_old := v_row.status;
  perform set_config('app.acquisition_status_reason', trim(p_reason), true);

  update public.acquisitions
  set
    status = p_new_status,
    updated_by = auth.uid()
  where id = p_acquisition_id
  returning * into v_row;

  perform public.write_audit_log(
    'ACQUISITION_STATUS_CHANGED',
    'acquisitions',
    p_acquisition_id,
    jsonb_build_object('status', v_old),
    jsonb_build_object('status', p_new_status),
    jsonb_build_object('reason', trim(p_reason))
  );

  return v_row;
end;
$$;

create or replace function public.approve_acquisition(
  p_acquisition_id uuid,
  p_note text default null
)
returns public.acquisitions
language plpgsql
security definer
set search_path = public
as $$
declare
  v_row public.acquisitions%rowtype;
begin
  select * into v_row
  from public.acquisitions
  where id = p_acquisition_id
  for update;

  if not found then
    raise exception 'acquisition not found';
  end if;

  if not public.has_permission_for_branch('acquisition.approve', v_row.branch_id) then
    raise exception 'not authorized';
  end if;

  if v_row.status is distinct from 'pending_approval' then
    raise exception 'acquisition is not pending approval';
  end if;

  if not public.acquisition_allows_self_approval()
     and v_row.created_by is not null
     and v_row.created_by = auth.uid() then
    raise exception 'self approval is not allowed';
  end if;

  if v_row.purchase_price is null or v_row.purchase_price < 0 then
    raise exception 'agreed purchase price required';
  end if;

  if v_row.vehicle_id is null then
    raise exception 'vehicle required';
  end if;

  perform set_config('app.acquisition_status_reason', coalesce(nullif(trim(p_note), ''), 'approved'), true);

  update public.acquisitions
  set
    status = 'approved',
    approved_by = auth.uid(),
    approved_at = timezone('utc', now()),
    approval_note = nullif(trim(coalesce(p_note, '')), ''),
    rejected_by = null,
    rejected_at = null,
    rejection_reason = null,
    updated_by = auth.uid()
  where id = p_acquisition_id
  returning * into v_row;

  perform public.write_audit_log(
    'ACQUISITION_APPROVED',
    'acquisitions',
    p_acquisition_id,
    jsonb_build_object('status', 'pending_approval'),
    jsonb_build_object('status', 'approved', 'approved_by', auth.uid()),
    jsonb_build_object('note', nullif(trim(coalesce(p_note, '')), ''))
  );

  return v_row;
end;
$$;

create or replace function public.reject_acquisition(
  p_acquisition_id uuid,
  p_reason text
)
returns public.acquisitions
language plpgsql
security definer
set search_path = public
as $$
declare
  v_row public.acquisitions%rowtype;
begin
  select * into v_row
  from public.acquisitions
  where id = p_acquisition_id
  for update;

  if not found then
    raise exception 'acquisition not found';
  end if;

  if not public.has_permission_for_branch('acquisition.approve', v_row.branch_id) then
    raise exception 'not authorized';
  end if;

  if v_row.status is distinct from 'pending_approval' then
    raise exception 'acquisition is not pending approval';
  end if;

  if p_reason is null or length(trim(p_reason)) = 0 then
    raise exception 'rejection reason required';
  end if;

  perform set_config('app.acquisition_status_reason', trim(p_reason), true);

  update public.acquisitions
  set
    status = 'rejected',
    rejected_by = auth.uid(),
    rejected_at = timezone('utc', now()),
    rejection_reason = trim(p_reason),
    updated_by = auth.uid()
  where id = p_acquisition_id
  returning * into v_row;

  perform public.write_audit_log(
    'ACQUISITION_REJECTED',
    'acquisitions',
    p_acquisition_id,
    jsonb_build_object('status', 'pending_approval'),
    jsonb_build_object('status', 'rejected', 'rejected_by', auth.uid()),
    jsonb_build_object('reason', trim(p_reason))
  );

  return v_row;
end;
$$;

create or replace function public.cancel_acquisition(
  p_acquisition_id uuid,
  p_reason text
)
returns public.acquisitions
language plpgsql
security definer
set search_path = public
as $$
declare
  v_row public.acquisitions%rowtype;
  v_old public.acquisition_status;
begin
  select * into v_row
  from public.acquisitions
  where id = p_acquisition_id
  for update;

  if not found then
    raise exception 'acquisition not found';
  end if;

  if not public.has_permission_for_branch('acquisition.cancel', v_row.branch_id)
     and not public.has_permission_for_branch('acquisition.edit', v_row.branch_id) then
    raise exception 'not authorized';
  end if;

  if not public.is_valid_acquisition_status_transition(v_row.status, 'cancelled') then
    raise exception 'invalid acquisition status transition from % to cancelled', v_row.status
      using errcode = 'check_violation';
  end if;

  if p_reason is null or length(trim(p_reason)) = 0 then
    raise exception 'reason required';
  end if;

  v_old := v_row.status;
  perform set_config('app.acquisition_status_reason', trim(p_reason), true);

  update public.acquisitions
  set
    status = 'cancelled',
    cancelled_at = timezone('utc', now()),
    cancel_reason = trim(p_reason),
    updated_by = auth.uid()
  where id = p_acquisition_id
  returning * into v_row;

  perform public.write_audit_log(
    'ACQUISITION_CANCELLED',
    'acquisitions',
    p_acquisition_id,
    jsonb_build_object('status', v_old),
    jsonb_build_object('status', 'cancelled'),
    jsonb_build_object('reason', trim(p_reason))
  );

  return v_row;
end;
$$;

create or replace function public.confirm_acquisition_purchase(
  p_acquisition_id uuid,
  p_reason text default null
)
returns public.acquisitions
language plpgsql
security definer
set search_path = public
as $$
declare
  v_row public.acquisitions%rowtype;
  v_vehicle public.vehicles%rowtype;
  v_total numeric(14, 2);
begin
  select * into v_row
  from public.acquisitions
  where id = p_acquisition_id
  for update;

  if not found then
    raise exception 'acquisition not found';
  end if;

  if not public.has_permission_for_branch('acquisition.edit', v_row.branch_id) then
    raise exception 'not authorized';
  end if;

  if v_row.status is distinct from 'approved' then
    raise exception 'acquisition must be approved before purchase';
  end if;

  if v_row.purchase_price is null then
    raise exception 'agreed purchase price required';
  end if;

  if v_row.vehicle_id is null then
    raise exception 'vehicle required';
  end if;

  if v_row.branch_id is null then
    raise exception 'branch required';
  end if;

  select * into v_vehicle
  from public.vehicles
  where id = v_row.vehicle_id and deleted_at is null
  for update;

  if not found then
    raise exception 'vehicle not found';
  end if;

  perform set_config(
    'app.acquisition_status_reason',
    coalesce(nullif(trim(p_reason), ''), 'purchased'),
    true
  );
  perform set_config('app.vehicle_status_reason', 'acquisition purchased', true);
  perform set_config('app.bypass_vehicle_cost_guard', 'true', true);

  update public.acquisitions
  set
    status = 'purchased',
    purchase_date = coalesce(purchase_date, (timezone('utc', now()))::date),
    updated_by = auth.uid()
  where id = p_acquisition_id
  returning * into v_row;

  v_total := public.acquisition_total_cost(p_acquisition_id);

  update public.vehicles
  set
    status = case
      when status in ('sold', 'delivered', 'archived') then status
      else 'acquired'
    end,
    branch_id = v_row.branch_id,
    source = public.map_acquisition_source_to_vehicle_source(v_row.source_type),
    purchase_date = coalesce(v_row.purchase_date, purchase_date),
    total_acquisition_cost = v_total,
    updated_by = auth.uid()
  where id = v_row.vehicle_id;

  -- Ensure purchase price line exists on the unified expense ledger.
  if not exists (
    select 1 from public.vehicle_expenses
    where acquisition_id = p_acquisition_id and category = 'purchase'
  ) then
    insert into public.vehicle_expenses (
      vehicle_id, acquisition_id, category, description, amount, currency, expense_date, created_by
    )
    values (
      v_row.vehicle_id,
      p_acquisition_id,
      'purchase',
      'Agreed purchase price',
      v_row.purchase_price,
      v_row.currency,
      coalesce(v_row.purchase_date, (timezone('utc', now()))::date),
      auth.uid()
    );
  end if;

  perform public.write_audit_log(
    'ACQUISITION_STATUS_CHANGED',
    'acquisitions',
    p_acquisition_id,
    jsonb_build_object('status', 'approved'),
    jsonb_build_object('status', 'purchased'),
    jsonb_build_object('reason', coalesce(nullif(trim(p_reason), ''), 'purchased'), 'vehicle_id', v_row.vehicle_id)
  );

  perform public.write_audit_log(
    'ACQUISITION_VEHICLE_LINKED',
    'acquisitions',
    p_acquisition_id,
    null,
    jsonb_build_object('vehicle_id', v_row.vehicle_id, 'total_acquisition_cost', v_total),
    null
  );

  return v_row;
end;
$$;

create or replace function public.receive_acquisition(
  p_acquisition_id uuid,
  p_reason text default null
)
returns public.acquisitions
language plpgsql
security definer
set search_path = public
as $$
declare
  v_row public.acquisitions%rowtype;
  v_old public.acquisition_status;
begin
  select * into v_row
  from public.acquisitions
  where id = p_acquisition_id
  for update;

  if not found then
    raise exception 'acquisition not found';
  end if;

  if not public.has_permission_for_branch('acquisition.edit', v_row.branch_id) then
    raise exception 'not authorized';
  end if;

  if not public.is_valid_acquisition_status_transition(v_row.status, 'received') then
    raise exception 'invalid acquisition status transition from % to received', v_row.status
      using errcode = 'check_violation';
  end if;

  v_old := v_row.status;
  perform set_config(
    'app.acquisition_status_reason',
    coalesce(nullif(trim(p_reason), ''), 'received'),
    true
  );

  update public.acquisitions
  set
    status = 'received',
    received_date = coalesce(received_date, (timezone('utc', now()))::date),
    updated_by = auth.uid()
  where id = p_acquisition_id
  returning * into v_row;

  -- Vehicle remains acquired; inspection is not auto-started.
  update public.vehicles
  set
    status = case
      when status in ('sold', 'delivered', 'archived', 'under_inspection', 'under_repair', 'ready_for_sale', 'reserved') then status
      else 'acquired'
    end,
    updated_by = auth.uid()
  where id = v_row.vehicle_id
    and deleted_at is null;

  perform public.write_audit_log(
    'ACQUISITION_STATUS_CHANGED',
    'acquisitions',
    p_acquisition_id,
    jsonb_build_object('status', v_old),
    jsonb_build_object('status', 'received'),
    jsonb_build_object('reason', coalesce(nullif(trim(p_reason), ''), 'received'))
  );

  return v_row;
end;
$$;

revoke all on function public.acquisition_expense_sum(uuid) from public;
revoke all on function public.acquisition_total_cost(uuid) from public;
revoke all on function public.read_acquisition_costs(uuid) from public;
revoke all on function public.read_acquisitions_costs(uuid[]) from public;
revoke all on function public.change_acquisition_status(uuid, public.acquisition_status, text) from public;
revoke all on function public.approve_acquisition(uuid, text) from public;
revoke all on function public.reject_acquisition(uuid, text) from public;
revoke all on function public.cancel_acquisition(uuid, text) from public;
revoke all on function public.confirm_acquisition_purchase(uuid, text) from public;
revoke all on function public.receive_acquisition(uuid, text) from public;

grant execute on function public.acquisition_expense_sum(uuid) to authenticated, service_role;
grant execute on function public.acquisition_total_cost(uuid) to authenticated, service_role;
grant execute on function public.read_acquisition_costs(uuid) to authenticated, service_role;
grant execute on function public.read_acquisitions_costs(uuid[]) to authenticated, service_role;
grant execute on function public.change_acquisition_status(uuid, public.acquisition_status, text) to authenticated, service_role;
grant execute on function public.approve_acquisition(uuid, text) to authenticated, service_role;
grant execute on function public.reject_acquisition(uuid, text) to authenticated, service_role;
grant execute on function public.cancel_acquisition(uuid, text) to authenticated, service_role;
grant execute on function public.confirm_acquisition_purchase(uuid, text) to authenticated, service_role;
grant execute on function public.receive_acquisition(uuid, text) to authenticated, service_role;

-- Allow server-side semantic expense/update audit events (function is SECURITY DEFINER + auth.uid()).
revoke all on function public.write_audit_log(text, text, uuid, jsonb, jsonb, jsonb) from public;
grant execute on function public.write_audit_log(text, text, uuid, jsonb, jsonb, jsonb) to authenticated, service_role;

-- ---------------------------------------------------------------------------
-- Permissions
-- ---------------------------------------------------------------------------

insert into public.permissions (key, name, module, description)
values
  ('acquisition.approve', 'Approve acquisitions', 'acquisition', 'Approve or reject pending acquisitions'),
  ('acquisition.cancel', 'Cancel acquisitions', 'acquisition', 'Cancel an acquisition in an allowed state'),
  ('acquisition.cost.view', 'View acquisition costs', 'acquisition', 'View purchase price and acquisition cost totals'),
  ('acquisition.cost.edit', 'Edit acquisition costs', 'acquisition', 'Edit purchase/asking prices after approval controls'),
  ('acquisition.expense.view', 'View acquisition expenses', 'acquisition', 'View acquisition expense line items'),
  ('acquisition.expense.create', 'Create acquisition expenses', 'acquisition', 'Add acquisition expense line items'),
  ('acquisition.expense.edit', 'Edit acquisition expenses', 'acquisition', 'Edit or remove acquisition expense line items')
on conflict (key) do update
set
  name = excluded.name,
  module = excluded.module,
  description = excluded.description;

insert into public.role_permissions (role_id, permission_id)
select r.id, p.id
from public.roles r
cross join public.permissions p
where r.key = 'super_admin'
  and p.key like 'acquisition.%'
on conflict do nothing;

insert into public.role_permissions (role_id, permission_id)
select r.id, p.id
from public.roles r
join public.permissions p on p.key in (
  'acquisition.approve', 'acquisition.cancel',
  'acquisition.cost.view', 'acquisition.cost.edit',
  'acquisition.expense.view', 'acquisition.expense.create', 'acquisition.expense.edit'
)
where r.key in ('admin', 'general_manager', 'inventory_manager')
on conflict do nothing;

insert into public.role_permissions (role_id, permission_id)
select r.id, p.id
from public.roles r
join public.permissions p on p.key in (
  'acquisition.view',
  'acquisition.cost.view',
  'acquisition.expense.view'
)
where r.key = 'accountant'
on conflict do nothing;

-- ---------------------------------------------------------------------------
-- RLS updates
-- ---------------------------------------------------------------------------

drop policy if exists acquisition_status_history_select on public.acquisition_status_history;
create policy "acquisition_status_history_select"
  on public.acquisition_status_history for select to authenticated
  using (
    exists (
      select 1 from public.acquisitions a
      where a.id = acquisition_id
        and public.has_permission_for_branch('acquisition.view', a.branch_id)
    )
  );

-- Expense policies: vehicle.cost.* OR acquisition.expense.*/cost.* via acquisition branch.
drop policy if exists vehicle_expenses_select on public.vehicle_expenses;
create policy "vehicle_expenses_select"
  on public.vehicle_expenses for select to authenticated
  using (
    exists (
      select 1 from public.vehicles v
      where v.id = vehicle_id
        and v.deleted_at is null
        and public.has_permission_for_branch('vehicle.cost.view', v.branch_id)
    )
    or (
      acquisition_id is not null
      and exists (
        select 1 from public.acquisitions a
        where a.id = acquisition_id
          and (
            public.has_permission_for_branch('acquisition.expense.view', a.branch_id)
            or public.has_permission_for_branch('acquisition.cost.view', a.branch_id)
          )
      )
    )
  );

drop policy if exists vehicle_expenses_mutate on public.vehicle_expenses;
create policy "vehicle_expenses_mutate"
  on public.vehicle_expenses for all to authenticated
  using (
    exists (
      select 1 from public.vehicles v
      where v.id = vehicle_id
        and v.deleted_at is null
        and public.has_permission_for_branch('vehicle.cost.edit', v.branch_id)
    )
    or (
      acquisition_id is not null
      and exists (
        select 1 from public.acquisitions a
        where a.id = acquisition_id
          and (
            public.has_permission_for_branch('acquisition.expense.edit', a.branch_id)
            or public.has_permission_for_branch('acquisition.expense.create', a.branch_id)
            or public.has_permission_for_branch('acquisition.cost.edit', a.branch_id)
          )
      )
    )
  )
  with check (
    exists (
      select 1 from public.vehicles v
      where v.id = vehicle_id
        and v.deleted_at is null
        and public.has_permission_for_branch('vehicle.cost.edit', v.branch_id)
    )
    or (
      acquisition_id is not null
      and exists (
        select 1 from public.acquisitions a
        where a.id = acquisition_id
          and (
            public.has_permission_for_branch('acquisition.expense.edit', a.branch_id)
            or public.has_permission_for_branch('acquisition.expense.create', a.branch_id)
            or public.has_permission_for_branch('acquisition.cost.edit', a.branch_id)
          )
      )
    )
  );

-- Allow acquisition cost editors to refresh vehicle.total_acquisition_cost on purchase.
create or replace function public.vehicles_guard_cost_columns()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  if nullif(current_setting('app.bypass_vehicle_cost_guard', true), '') = 'true' then
    return new;
  end if;

  if tg_op = 'UPDATE' then
    if new.total_acquisition_cost is distinct from old.total_acquisition_cost
       or new.minimum_selling_price is distinct from old.minimum_selling_price then
      if not public.has_permission_for_branch('vehicle.cost.edit', new.branch_id)
         and not public.has_permission_for_branch('acquisition.cost.edit', new.branch_id)
         and not public.has_permission_for_branch('vehicle.profit.view', new.branch_id) then
        if not public.has_permission_for_branch('vehicle.price.edit', new.branch_id) then
          raise exception 'not authorized to change vehicle cost fields';
        end if;
      end if;
    end if;
  elsif tg_op = 'INSERT' then
    if (new.total_acquisition_cost is distinct from 0)
       and not public.has_permission_for_branch('vehicle.cost.edit', new.branch_id)
       and not public.has_permission_for_branch('vehicle.create', new.branch_id)
       and not public.has_permission_for_branch('acquisition.create', new.branch_id) then
      raise exception 'not authorized to set vehicle cost fields';
    end if;
  end if;
  return new;
end;
$$;

-- Document types foundation for acquisitions (Phase 15 will expand document UX).
insert into public.document_types (key, name, description, is_active)
values
  ('purchase_agreement', 'Purchase Agreement', 'Acquisition purchase agreement', true),
  ('seller_documents', 'Seller Documents', 'Seller identity / ownership documents', true),
  ('auction_documents', 'Auction Documents', 'Auction lot and sale documents', true),
  ('import_documents', 'Import Documents', 'Import / customs related acquisition documents', true)
on conflict (key) do update
set
  name = excluded.name,
  description = excluded.description,
  is_active = excluded.is_active;

comment on table public.acquisition_status_history is
  'Append-only acquisition workflow status changes.';
comment on column public.acquisitions.acquisition_number is
  'Dealership acquisition reference, e.g. ZM-ACQ-000001.';
comment on column public.acquisitions.purchase_price is
  'Agreed purchase price (numeric). Sensitive — access via read_acquisition_costs.';
