-- Phase 7: Vehicle Inspection Management.
-- Evolves Phase 3 inspections (00010); preserves workshop_orders.inspection_id FK.

-- ---------------------------------------------------------------------------
-- New enums
-- ---------------------------------------------------------------------------

do $$ begin
  create type public.inspection_type as enum (
    'full_inspection',
    'basic_inspection',
    'pre_purchase_inspection',
    'return_inspection',
    're_inspection'
  );
exception when duplicate_object then null; end $$;

do $$ begin
  create type public.inspection_severity as enum (
    'info',
    'minor',
    'moderate',
    'major',
    'critical'
  );
exception when duplicate_object then null; end $$;

do $$ begin
  create type public.inspection_recommendation as enum (
    'no_action',
    'monitor',
    'repair_before_sale',
    'repair_urgently',
    'replace',
    'reinspect'
  );
exception when duplicate_object then null; end $$;

do $$ begin
  create type public.inspection_photo_category as enum (
    'front',
    'rear',
    'left_side',
    'right_side',
    'interior',
    'dashboard',
    'odometer',
    'vin',
    'engine',
    'tyre',
    'damage',
    'undercarriage',
    'other'
  );
exception when duplicate_object then null; end $$;

do $$ begin
  create type public.inspection_damage_type as enum (
    'scratch',
    'dent',
    'paint_damage',
    'crack',
    'rust',
    'panel_damage',
    'glass_damage',
    'mechanical_damage',
    'electrical_damage',
    'accident_damage',
    'wear_and_tear',
    'other'
  );
exception when duplicate_object then null; end $$;

do $$ begin
  create type public.inspection_damage_location as enum (
    'front',
    'rear',
    'left_side',
    'right_side',
    'roof',
    'interior',
    'engine_bay',
    'undercarriage',
    'other'
  );
exception when duplicate_object then null; end $$;

-- ---------------------------------------------------------------------------
-- Replace inspection_status (v2 swap)
-- pending→draft, in_progress→in_progress, completed→approved, cancelled→cancelled
-- ---------------------------------------------------------------------------

do $$
begin
  if exists (
    select 1
    from pg_enum e
    join pg_type t on t.oid = e.enumtypid
    join pg_namespace n on n.oid = t.typnamespace
    where n.nspname = 'public'
      and t.typname = 'inspection_status'
      and e.enumlabel = 'pending'
  ) then
    if not exists (
      select 1 from pg_type t
      join pg_namespace n on n.oid = t.typnamespace
      where n.nspname = 'public' and t.typname = 'inspection_status_v2'
    ) then
      create type public.inspection_status_v2 as enum (
        'draft',
        'assigned',
        'in_progress',
        'submitted',
        'under_review',
        'approved',
        'rejected',
        'cancelled'
      );
    end if;

    alter table public.inspections alter column status drop default;

    alter table public.inspections
      alter column status type public.inspection_status_v2
      using (
        case status::text
          when 'pending' then 'draft'
          when 'in_progress' then 'in_progress'
          when 'completed' then 'approved'
          when 'cancelled' then 'cancelled'
          when 'draft' then 'draft'
          when 'assigned' then 'assigned'
          when 'submitted' then 'submitted'
          when 'under_review' then 'under_review'
          when 'approved' then 'approved'
          when 'rejected' then 'rejected'
          else 'draft'
        end
      )::public.inspection_status_v2;

    drop type public.inspection_status;
    alter type public.inspection_status_v2 rename to inspection_status;

    alter table public.inspections
      alter column status set default 'draft'::public.inspection_status;
  end if;
end $$;

-- Ensure default is draft even if already migrated.
alter table public.inspections
  alter column status set default 'draft'::public.inspection_status;

-- ---------------------------------------------------------------------------
-- Replace inspection_result (v2 swap)
-- pass→pass, pass_with_repairs→repair_required, fail→fail
-- ---------------------------------------------------------------------------

do $$
begin
  if exists (
    select 1
    from pg_enum e
    join pg_type t on t.oid = e.enumtypid
    join pg_namespace n on n.oid = t.typnamespace
    where n.nspname = 'public'
      and t.typname = 'inspection_result'
      and e.enumlabel = 'pass_with_repairs'
  ) then
    if not exists (
      select 1 from pg_type t
      join pg_namespace n on n.oid = t.typnamespace
      where n.nspname = 'public' and t.typname = 'inspection_result_v2'
    ) then
      create type public.inspection_result_v2 as enum (
        'pass',
        'pass_with_advisories',
        'repair_required',
        'fail'
      );
    end if;

    alter table public.inspections
      alter column result type public.inspection_result_v2
      using (
        case result::text
          when 'pass' then 'pass'
          when 'pass_with_repairs' then 'repair_required'
          when 'fail' then 'fail'
          when 'pass_with_advisories' then 'pass_with_advisories'
          when 'repair_required' then 'repair_required'
          else null
        end
      )::public.inspection_result_v2;

    drop type public.inspection_result;
    alter type public.inspection_result_v2 rename to inspection_result;
  end if;
end $$;

-- ---------------------------------------------------------------------------
-- Replace inspection_item_result (v2 swap)
-- pass→pass, warning→advisory, fail→fail, not_applicable→not_applicable
-- ---------------------------------------------------------------------------

do $$
begin
  if exists (
    select 1
    from pg_enum e
    join pg_type t on t.oid = e.enumtypid
    join pg_namespace n on n.oid = t.typnamespace
    where n.nspname = 'public'
      and t.typname = 'inspection_item_result'
      and e.enumlabel = 'warning'
  ) then
    if not exists (
      select 1 from pg_type t
      join pg_namespace n on n.oid = t.typnamespace
      where n.nspname = 'public' and t.typname = 'inspection_item_result_v2'
    ) then
      create type public.inspection_item_result_v2 as enum (
        'pass',
        'fail',
        'advisory',
        'not_applicable',
        'not_tested'
      );
    end if;

    alter table public.inspection_items
      alter column result type public.inspection_item_result_v2
      using (
        case result::text
          when 'pass' then 'pass'
          when 'warning' then 'advisory'
          when 'fail' then 'fail'
          when 'not_applicable' then 'not_applicable'
          when 'advisory' then 'advisory'
          when 'not_tested' then 'not_tested'
          else null
        end
      )::public.inspection_item_result_v2;

    drop type public.inspection_item_result;
    alter type public.inspection_item_result_v2 rename to inspection_item_result;
  end if;
end $$;

-- ---------------------------------------------------------------------------
-- Expand inspections columns
-- ---------------------------------------------------------------------------

alter table public.inspections
  add column if not exists inspection_number text,
  add column if not exists inspection_type public.inspection_type not null default 'full_inspection',
  add column if not exists assigned_to uuid references public.profiles (id) on delete set null,
  add column if not exists assigned_at timestamptz,
  add column if not exists assigned_by uuid references public.profiles (id) on delete set null,
  add column if not exists inspected_by uuid references public.profiles (id) on delete set null,
  add column if not exists reviewed_by uuid references public.profiles (id) on delete set null,
  add column if not exists reviewed_at timestamptz,
  add column if not exists approved_at timestamptz,
  add column if not exists overall_score numeric(5, 2),
  add column if not exists odometer_reading numeric,
  add column if not exists odometer_unit text not null default 'KM',
  add column if not exists summary text,
  add column if not exists recommendation public.inspection_recommendation,
  add column if not exists parent_inspection_id uuid references public.inspections (id) on delete set null,
  add column if not exists submitted_at timestamptz,
  add column if not exists rejected_at timestamptz,
  add column if not exists rejection_reason text,
  add column if not exists cancel_reason text,
  add column if not exists cancelled_at timestamptz,
  add column if not exists review_note text,
  add column if not exists vin_verified boolean,
  add column if not exists vin_mismatch boolean,
  add column if not exists verified_vin text,
  add column if not exists updated_by uuid references public.profiles (id) on delete set null;

-- Backfill inspected_by from legacy inspector_id.
update public.inspections
set inspected_by = inspector_id
where inspected_by is null
  and inspector_id is not null;

-- Backfill approved_at from completed_at for previously completed → approved rows.
update public.inspections
set approved_at = coalesce(approved_at, completed_at)
where status = 'approved'
  and approved_at is null
  and completed_at is not null;

do $$ begin
  alter table public.inspections
    add constraint inspections_overall_score_range
    check (overall_score is null or (overall_score >= 0 and overall_score <= 100));
exception when duplicate_object then null; end $$;

do $$ begin
  alter table public.inspections
    add constraint inspections_odometer_non_negative
    check (odometer_reading is null or odometer_reading >= 0);
exception when duplicate_object then null; end $$;

do $$ begin
  alter table public.inspections
    add constraint inspections_odometer_unit_not_blank
    check (length(trim(odometer_unit)) > 0);
exception when duplicate_object then null; end $$;

do $$ begin
  alter table public.inspections
    add constraint inspections_submitted_after_started
    check (
      submitted_at is null
      or started_at is null
      or submitted_at >= started_at
    );
exception when duplicate_object then null; end $$;

-- ---------------------------------------------------------------------------
-- Inspection number generation (ZM-INSP-000001)
-- ---------------------------------------------------------------------------

create sequence if not exists public.inspection_number_seq;

create or replace function public.next_inspection_number()
returns text
language plpgsql
security definer
set search_path = public
as $$
declare
  n bigint;
begin
  n := nextval('public.inspection_number_seq');
  return 'ZM-INSP-' || lpad(n::text, 6, '0');
end;
$$;

revoke all on function public.next_inspection_number() from public;
grant execute on function public.next_inspection_number() to authenticated, service_role;

create or replace function public.inspections_assign_number()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  if new.inspection_number is null or length(trim(new.inspection_number)) = 0 then
    new.inspection_number := public.next_inspection_number();
  end if;
  return new;
end;
$$;

drop trigger if exists inspections_assign_number on public.inspections;
create trigger inspections_assign_number
before insert on public.inspections
for each row execute function public.inspections_assign_number();

do $$
declare
  r record;
  max_n bigint;
begin
  for r in
    select id from public.inspections
    where inspection_number is null or length(trim(inspection_number)) = 0
    order by created_at, id
  loop
    update public.inspections
    set inspection_number = public.next_inspection_number()
    where id = r.id;
  end loop;

  select coalesce(max(
    case
      when inspection_number ~ '^ZM-INSP-[0-9]+$'
        then substring(inspection_number from 9)::bigint
      else 0
    end
  ), 0)
  into max_n
  from public.inspections;

  if max_n > 0 then
    perform setval('public.inspection_number_seq', max_n, true);
  end if;
end $$;

alter table public.inspections
  alter column inspection_number set not null;

create unique index if not exists inspections_inspection_number_unique
  on public.inspections (inspection_number);

create index if not exists inspections_assigned_to_idx on public.inspections (assigned_to);
create index if not exists inspections_inspected_by_idx on public.inspections (inspected_by);
create index if not exists inspections_created_at_idx on public.inspections (created_at);
create index if not exists inspections_updated_at_idx on public.inspections (updated_at);
create index if not exists inspections_parent_inspection_id_idx on public.inspections (parent_inspection_id);
create index if not exists inspections_inspection_type_idx on public.inspections (inspection_type);
create index if not exists inspections_submitted_at_idx on public.inspections (submitted_at);

-- ---------------------------------------------------------------------------
-- Expand inspection_templates / template_items
-- ---------------------------------------------------------------------------

alter table public.inspection_templates
  add column if not exists inspection_type public.inspection_type not null default 'full_inspection';

alter table public.inspection_template_items
  add column if not exists section_key text;

update public.inspection_template_items
set section_key = case lower(trim(category))
  when 'exterior' then 'exterior'
  when 'interior' then 'interior'
  when 'mechanical' then 'engine'
  when 'engine' then 'engine'
  when 'transmission' then 'transmission'
  when 'electrical' then 'electrical'
  when 'tyres' then 'tyres_wheels'
  when 'tyres_wheels' then 'tyres_wheels'
  when 'safety' then 'safety'
  when 'brakes' then 'brakes'
  when 'documents' then 'documents'
  when 'vehicle identity' then 'vehicle_identity'
  when 'vehicle_identity' then 'vehicle_identity'
  else lower(regexp_replace(trim(category), '[^a-zA-Z0-9]+', '_', 'g'))
end
where section_key is null
  and category is not null
  and length(trim(category)) > 0;

update public.inspection_template_items
set section_key = 'other'
where section_key is null or length(trim(section_key)) = 0;

do $$ begin
  alter table public.inspection_template_items
    alter column section_key set not null;
exception when others then null; end $$;

create index if not exists inspection_template_items_section_key_idx
  on public.inspection_template_items (template_id, section_key, sort_order);

-- ---------------------------------------------------------------------------
-- New table: inspection_sections
-- ---------------------------------------------------------------------------

create table if not exists public.inspection_sections (
  id uuid primary key default gen_random_uuid(),
  inspection_id uuid not null references public.inspections (id) on delete cascade,
  section_key text not null,
  name text not null,
  sort_order integer not null default 0,
  is_required boolean not null default true,
  is_completed boolean not null default false,
  notes text,
  created_at timestamptz not null default timezone('utc', now()),
  updated_at timestamptz not null default timezone('utc', now()),
  constraint inspection_sections_section_key_not_blank check (length(trim(section_key)) > 0),
  constraint inspection_sections_name_not_blank check (length(trim(name)) > 0),
  constraint inspection_sections_unique_key unique (inspection_id, section_key)
);

create index if not exists inspection_sections_inspection_id_idx
  on public.inspection_sections (inspection_id, sort_order);

drop trigger if exists inspection_sections_set_updated_at on public.inspection_sections;
create trigger inspection_sections_set_updated_at
before update on public.inspection_sections
for each row execute function public.set_updated_at();

alter table public.inspection_sections enable row level security;

-- ---------------------------------------------------------------------------
-- Expand inspection_items
-- ---------------------------------------------------------------------------

alter table public.inspection_items
  add column if not exists section_id uuid references public.inspection_sections (id) on delete set null,
  add column if not exists section_key text,
  add column if not exists sort_order integer not null default 0,
  add column if not exists is_required boolean not null default true;

update public.inspection_items
set section_key = case lower(trim(category))
  when 'exterior' then 'exterior'
  when 'interior' then 'interior'
  when 'mechanical' then 'engine'
  when 'engine' then 'engine'
  when 'transmission' then 'transmission'
  when 'electrical' then 'electrical'
  when 'tyres' then 'tyres_wheels'
  when 'safety' then 'safety'
  when 'brakes' then 'brakes'
  else lower(regexp_replace(trim(coalesce(category, 'other')), '[^a-zA-Z0-9]+', '_', 'g'))
end
where section_key is null;

-- Migrate severity text → inspection_severity enum when still text.
do $$
begin
  if exists (
    select 1 from information_schema.columns
    where table_schema = 'public'
      and table_name = 'inspection_items'
      and column_name = 'severity'
      and udt_name = 'text'
  ) then
    alter table public.inspection_items
      alter column severity type public.inspection_severity
      using (
        case lower(coalesce(severity, ''))
          when 'critical' then 'critical'::public.inspection_severity
          when 'major' then 'major'::public.inspection_severity
          when 'moderate' then 'moderate'::public.inspection_severity
          when 'minor' then 'minor'::public.inspection_severity
          when 'info' then 'info'::public.inspection_severity
          when 'warning' then 'minor'::public.inspection_severity
          when 'high' then 'major'::public.inspection_severity
          when 'medium' then 'moderate'::public.inspection_severity
          when 'low' then 'minor'::public.inspection_severity
          else null
        end
      );
  end if;
exception when others then
  raise notice 'inspection_items.severity migration skipped: %', sqlerrm;
end $$;

create index if not exists inspection_items_section_id_idx
  on public.inspection_items (section_id);

create index if not exists inspection_items_section_key_idx
  on public.inspection_items (inspection_id, section_key, sort_order);

-- ---------------------------------------------------------------------------
-- New table: inspection_findings
-- ---------------------------------------------------------------------------

create table if not exists public.inspection_findings (
  id uuid primary key default gen_random_uuid(),
  inspection_id uuid not null references public.inspections (id) on delete cascade,
  inspection_item_id uuid references public.inspection_items (id) on delete set null,
  section_id uuid references public.inspection_sections (id) on delete set null,
  result public.inspection_item_result not null default 'fail',
  severity public.inspection_severity not null default 'moderate',
  title text not null,
  description text,
  recommended_action text,
  recommendation public.inspection_recommendation,
  estimated_cost numeric(14, 2),
  currency text not null default 'AED',
  damage_type public.inspection_damage_type,
  damage_location public.inspection_damage_location,
  is_critical boolean generated always as (severity = 'critical'::public.inspection_severity) stored,
  is_resolved boolean not null default false,
  created_by uuid references public.profiles (id) on delete set null,
  updated_by uuid references public.profiles (id) on delete set null,
  created_at timestamptz not null default timezone('utc', now()),
  updated_at timestamptz not null default timezone('utc', now()),
  constraint inspection_findings_title_not_blank check (length(trim(title)) > 0),
  constraint inspection_findings_estimated_cost_non_negative
    check (estimated_cost is null or estimated_cost >= 0),
  constraint inspection_findings_currency_format check (currency ~ '^[A-Z]{3}$')
);

create index if not exists inspection_findings_inspection_id_idx
  on public.inspection_findings (inspection_id);

create index if not exists inspection_findings_severity_idx
  on public.inspection_findings (inspection_id, severity);

create index if not exists inspection_findings_result_idx
  on public.inspection_findings (inspection_id, result);

create index if not exists inspection_findings_critical_idx
  on public.inspection_findings (inspection_id)
  where severity = 'critical' and is_resolved = false;

drop trigger if exists inspection_findings_set_updated_at on public.inspection_findings;
create trigger inspection_findings_set_updated_at
before update on public.inspection_findings
for each row execute function public.set_updated_at();

alter table public.inspection_findings enable row level security;

-- ---------------------------------------------------------------------------
-- New table: inspection_recommendations
-- ---------------------------------------------------------------------------

create table if not exists public.inspection_recommendations (
  id uuid primary key default gen_random_uuid(),
  inspection_id uuid not null references public.inspections (id) on delete cascade,
  finding_id uuid references public.inspection_findings (id) on delete cascade,
  recommendation public.inspection_recommendation not null,
  priority text,
  notes text,
  estimated_cost numeric(14, 2),
  currency text not null default 'AED',
  created_by uuid references public.profiles (id) on delete set null,
  created_at timestamptz not null default timezone('utc', now()),
  updated_at timestamptz not null default timezone('utc', now()),
  constraint inspection_recommendations_estimated_cost_non_negative
    check (estimated_cost is null or estimated_cost >= 0),
  constraint inspection_recommendations_currency_format check (currency ~ '^[A-Z]{3}$')
);

create index if not exists inspection_recommendations_inspection_id_idx
  on public.inspection_recommendations (inspection_id);

drop trigger if exists inspection_recommendations_set_updated_at on public.inspection_recommendations;
create trigger inspection_recommendations_set_updated_at
before update on public.inspection_recommendations
for each row execute function public.set_updated_at();

alter table public.inspection_recommendations enable row level security;

-- ---------------------------------------------------------------------------
-- Expand inspection_photos
-- ---------------------------------------------------------------------------

alter table public.inspection_photos
  add column if not exists section_id uuid references public.inspection_sections (id) on delete set null,
  add column if not exists finding_id uuid references public.inspection_findings (id) on delete set null,
  add column if not exists category public.inspection_photo_category not null default 'other',
  add column if not exists updated_at timestamptz not null default timezone('utc', now());

create index if not exists inspection_photos_inspection_id_idx
  on public.inspection_photos (inspection_id);

create index if not exists inspection_photos_finding_id_idx
  on public.inspection_photos (finding_id);

create index if not exists inspection_photos_section_id_idx
  on public.inspection_photos (section_id);

drop trigger if exists inspection_photos_set_updated_at on public.inspection_photos;
create trigger inspection_photos_set_updated_at
before update on public.inspection_photos
for each row execute function public.set_updated_at();

-- ---------------------------------------------------------------------------
-- Status history
-- ---------------------------------------------------------------------------

create table if not exists public.inspection_status_history (
  id uuid primary key default gen_random_uuid(),
  inspection_id uuid not null references public.inspections (id) on delete cascade,
  from_status public.inspection_status,
  to_status public.inspection_status not null,
  reason text,
  changed_by uuid references public.profiles (id) on delete set null,
  changed_at timestamptz not null default timezone('utc', now())
);

create index if not exists inspection_status_history_inspection_id_idx
  on public.inspection_status_history (inspection_id, changed_at desc);

alter table public.inspection_status_history enable row level security;

-- ---------------------------------------------------------------------------
-- Status transition rules
-- ---------------------------------------------------------------------------

create or replace function public.is_valid_inspection_status_transition(
  p_from public.inspection_status,
  p_to public.inspection_status
)
returns boolean
language sql
immutable
as $$
  select case
    when p_from is null then true
    when p_from = p_to then true
    when p_from = 'draft' and p_to in ('assigned', 'in_progress', 'cancelled') then true
    when p_from = 'assigned' and p_to in ('in_progress', 'cancelled') then true
    when p_from = 'in_progress' and p_to in ('submitted', 'cancelled') then true
    when p_from = 'submitted' and p_to in ('under_review', 'cancelled') then true
    when p_from = 'under_review' and p_to in ('approved', 'rejected', 'cancelled') then true
    when p_from = 'rejected' and p_to in ('in_progress', 'cancelled') then true
    when p_from = 'approved' then false
    when p_from = 'cancelled' then false
    else false
  end;
$$;

create or replace function public.enforce_inspection_status_transition()
returns trigger
language plpgsql
as $$
begin
  if tg_op = 'UPDATE'
     and new.status is distinct from old.status
     and not public.is_valid_inspection_status_transition(old.status, new.status) then
    raise exception 'invalid inspection status transition from % to %', old.status, new.status
      using errcode = 'check_violation';
  end if;
  return new;
end;
$$;

drop trigger if exists inspections_enforce_status_transition on public.inspections;
create trigger inspections_enforce_status_transition
before update of status on public.inspections
for each row execute function public.enforce_inspection_status_transition();

create or replace function public.track_inspection_status_change()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  v_reason text;
begin
  v_reason := nullif(current_setting('app.inspection_status_reason', true), '');

  if tg_op = 'UPDATE' and new.status is distinct from old.status then
    insert into public.inspection_status_history (
      inspection_id, from_status, to_status, reason, changed_by
    )
    values (
      new.id,
      old.status,
      new.status,
      coalesce(v_reason, 'status_change'),
      auth.uid()
    );
  elsif tg_op = 'INSERT' then
    insert into public.inspection_status_history (
      inspection_id, from_status, to_status, reason, changed_by
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

drop trigger if exists inspections_track_status_change on public.inspections;
create trigger inspections_track_status_change
after insert or update of status on public.inspections
for each row execute function public.track_inspection_status_change();

-- Configurable self-approval rule (default: disallow).
create or replace function public.inspection_allows_self_approval()
returns boolean
language sql
stable
as $$
  select false;
$$;

-- ---------------------------------------------------------------------------
-- Checklist population from template
-- ---------------------------------------------------------------------------

create or replace function public.inspection_section_display_name(p_section_key text)
returns text
language sql
immutable
as $$
  select case p_section_key
    when 'vehicle_identity' then 'Vehicle Identity'
    when 'exterior' then 'Exterior'
    when 'interior' then 'Interior'
    when 'engine' then 'Engine'
    when 'transmission' then 'Transmission'
    when 'electrical' then 'Electrical'
    when 'air_conditioning' then 'Air Conditioning'
    when 'brakes' then 'Brakes'
    when 'suspension' then 'Suspension'
    when 'steering' then 'Steering'
    when 'tyres_wheels' then 'Tyres & Wheels'
    when 'fluids' then 'Fluids'
    when 'lights' then 'Lights'
    when 'safety' then 'Safety'
    when 'undercarriage' then 'Undercarriage'
    when 'accident_damage' then 'Accident Damage'
    when 'road_test' then 'Road Test'
    when 'documents' then 'Documents'
    when 'final_assessment' then 'Final Assessment'
    else initcap(replace(coalesce(p_section_key, 'other'), '_', ' '))
  end;
$$;

create or replace function public.populate_inspection_checklist(p_inspection_id uuid)
returns public.inspections
language plpgsql
security definer
set search_path = public
as $$
declare
  v_row public.inspections%rowtype;
  v_section record;
  v_section_id uuid;
begin
  select * into v_row
  from public.inspections
  where id = p_inspection_id
  for update;

  if not found then
    raise exception 'inspection not found';
  end if;

  if v_row.template_id is null then
    raise exception 'inspection has no template';
  end if;

  if not public.has_permission_for_branch('inspection.create', v_row.branch_id)
     and not public.has_permission_for_branch('inspection.edit', v_row.branch_id)
     and not public.has_permission_for_branch('inspection.reinspect', v_row.branch_id) then
    raise exception 'not authorized';
  end if;

  -- Only populate when empty (idempotent).
  if exists (select 1 from public.inspection_items where inspection_id = p_inspection_id) then
    return v_row;
  end if;

  for v_section in
    select
      ti.section_key,
      min(ti.sort_order) as sort_order,
      bool_or(ti.is_required) as is_required
    from public.inspection_template_items ti
    where ti.template_id = v_row.template_id
    group by ti.section_key
    order by min(ti.sort_order), ti.section_key
  loop
    insert into public.inspection_sections (
      inspection_id, section_key, name, sort_order, is_required
    )
    values (
      p_inspection_id,
      v_section.section_key,
      public.inspection_section_display_name(v_section.section_key),
      v_section.sort_order,
      coalesce(v_section.is_required, true)
    )
    on conflict (inspection_id, section_key) do update
      set name = excluded.name
    returning id into v_section_id;

    insert into public.inspection_items (
      inspection_id,
      template_item_id,
      section_id,
      section_key,
      name,
      category,
      sort_order,
      is_required,
      result
    )
    select
      p_inspection_id,
      ti.id,
      v_section_id,
      ti.section_key,
      ti.name,
      coalesce(nullif(trim(ti.category), ''), public.inspection_section_display_name(ti.section_key)),
      ti.sort_order,
      ti.is_required,
      'not_tested'::public.inspection_item_result
    from public.inspection_template_items ti
    where ti.template_id = v_row.template_id
      and ti.section_key = v_section.section_key
    order by ti.sort_order, ti.name;
  end loop;

  select * into v_row from public.inspections where id = p_inspection_id;
  return v_row;
end;
$$;

-- ---------------------------------------------------------------------------
-- Cost read helper (estimated_cost columns revoked from authenticated)
-- ---------------------------------------------------------------------------

create or replace function public.read_inspection_costs(p_inspection_id uuid)
returns table (
  finding_id uuid,
  finding_title text,
  finding_estimated_cost numeric,
  recommendation_id uuid,
  recommendation_estimated_cost numeric,
  currency text,
  findings_total numeric,
  recommendations_total numeric
)
language plpgsql
stable
security definer
set search_path = public
as $$
declare
  v_branch uuid;
begin
  select i.branch_id into v_branch
  from public.inspections i
  where i.id = p_inspection_id;

  if v_branch is null then
    return;
  end if;

  if not public.has_permission_for_branch('inspection.cost.view', v_branch) then
    raise exception 'not authorized';
  end if;

  return query
  with f as (
    select
      f.id,
      f.title,
      f.estimated_cost,
      f.currency
    from public.inspection_findings f
    where f.inspection_id = p_inspection_id
  ),
  r as (
    select
      r.id,
      r.estimated_cost,
      r.currency,
      r.finding_id
    from public.inspection_recommendations r
    where r.inspection_id = p_inspection_id
  )
  select
    f.id,
    f.title,
    f.estimated_cost,
    r.id,
    r.estimated_cost,
    coalesce(f.currency, r.currency, 'AED'),
    (select coalesce(sum(x.estimated_cost), 0) from f x),
    (select coalesce(sum(x.estimated_cost), 0) from r x)
  from f
  full outer join r on r.finding_id = f.id;
end;
$$;

-- ---------------------------------------------------------------------------
-- Secure RPCs
-- ---------------------------------------------------------------------------

create or replace function public.change_inspection_status(
  p_inspection_id uuid,
  p_new_status public.inspection_status,
  p_reason text default null
)
returns public.inspections
language plpgsql
security definer
set search_path = public
as $$
declare
  v_row public.inspections%rowtype;
  v_old public.inspection_status;
begin
  select * into v_row
  from public.inspections
  where id = p_inspection_id
  for update;

  if not found then
    raise exception 'inspection not found';
  end if;

  if not public.has_permission_for_branch('inspection.edit', v_row.branch_id) then
    raise exception 'not authorized';
  end if;

  if p_new_status in ('approved', 'rejected', 'cancelled', 'submitted') then
    raise exception 'use dedicated approve/reject/cancel/submit operations';
  end if;

  if p_new_status = 'under_review'
     and not public.has_permission_for_branch('inspection.review', v_row.branch_id)
     and not public.has_permission_for_branch('inspection.edit', v_row.branch_id) then
    raise exception 'not authorized';
  end if;

  if p_reason is null or length(trim(p_reason)) = 0 then
    raise exception 'reason required';
  end if;

  if not public.is_valid_inspection_status_transition(v_row.status, p_new_status) then
    raise exception 'invalid inspection status transition from % to %', v_row.status, p_new_status
      using errcode = 'check_violation';
  end if;

  v_old := v_row.status;
  perform set_config('app.inspection_status_reason', trim(p_reason), true);

  update public.inspections
  set
    status = p_new_status,
    updated_by = auth.uid()
  where id = p_inspection_id
  returning * into v_row;

  perform public.write_audit_log(
    'INSPECTION_STATUS_CHANGED',
    'inspections',
    p_inspection_id,
    jsonb_build_object('status', v_old),
    jsonb_build_object('status', p_new_status),
    jsonb_build_object('reason', trim(p_reason))
  );

  return v_row;
end;
$$;

create or replace function public.assign_inspection(
  p_inspection_id uuid,
  p_assigned_to uuid,
  p_reason text default null
)
returns public.inspections
language plpgsql
security definer
set search_path = public
as $$
declare
  v_row public.inspections%rowtype;
  v_old public.inspection_status;
begin
  select * into v_row
  from public.inspections
  where id = p_inspection_id
  for update;

  if not found then
    raise exception 'inspection not found';
  end if;

  if not public.has_permission_for_branch('inspection.edit', v_row.branch_id) then
    raise exception 'not authorized';
  end if;

  if p_assigned_to is null then
    raise exception 'assigned_to required';
  end if;

  if not exists (select 1 from public.profiles where id = p_assigned_to and deleted_at is null) then
    raise exception 'assignee not found';
  end if;

  if v_row.status not in ('draft', 'assigned') then
    raise exception 'inspection cannot be assigned from status %', v_row.status;
  end if;

  v_old := v_row.status;
  perform set_config(
    'app.inspection_status_reason',
    coalesce(nullif(trim(p_reason), ''), 'assigned'),
    true
  );

  update public.inspections
  set
    assigned_to = p_assigned_to,
    assigned_at = timezone('utc', now()),
    assigned_by = auth.uid(),
    status = case when status = 'draft' then 'assigned'::public.inspection_status else status end,
    updated_by = auth.uid()
  where id = p_inspection_id
  returning * into v_row;

  perform public.write_audit_log(
    'INSPECTION_ASSIGNED',
    'inspections',
    p_inspection_id,
    jsonb_build_object('status', v_old, 'assigned_to', null),
    jsonb_build_object('status', v_row.status, 'assigned_to', p_assigned_to),
    jsonb_build_object('reason', coalesce(nullif(trim(p_reason), ''), 'assigned'))
  );

  return v_row;
end;
$$;

create or replace function public.start_inspection(p_inspection_id uuid)
returns public.inspections
language plpgsql
security definer
set search_path = public
as $$
declare
  v_row public.inspections%rowtype;
  v_old public.inspection_status;
  v_vehicle public.vehicles%rowtype;
begin
  select * into v_row
  from public.inspections
  where id = p_inspection_id
  for update;

  if not found then
    raise exception 'inspection not found';
  end if;

  if not public.has_permission_for_branch('inspection.edit', v_row.branch_id)
     and not public.has_permission_for_branch('inspection.submit', v_row.branch_id) then
    raise exception 'not authorized';
  end if;

  if v_row.status not in ('draft', 'assigned', 'rejected') then
    raise exception 'inspection cannot be started from status %', v_row.status;
  end if;

  -- rejected → in_progress is allowed; draft/assigned → in_progress too.
  if not public.is_valid_inspection_status_transition(v_row.status, 'in_progress') then
    raise exception 'invalid inspection status transition from % to in_progress', v_row.status
      using errcode = 'check_violation';
  end if;

  v_old := v_row.status;
  perform set_config('app.inspection_status_reason', 'started', true);

  update public.inspections
  set
    status = 'in_progress',
    started_at = coalesce(started_at, timezone('utc', now())),
    inspected_by = coalesce(inspected_by, auth.uid()),
    inspector_id = coalesce(inspector_id, auth.uid()),
    updated_by = auth.uid()
  where id = p_inspection_id
  returning * into v_row;

  -- Optionally move vehicle into under_inspection when eligible.
  select * into v_vehicle
  from public.vehicles
  where id = v_row.vehicle_id and deleted_at is null
  for update;

  if found
     and v_vehicle.status in ('acquired', 'returned', 'inspection_failed')
     and public.is_valid_vehicle_status_transition(v_vehicle.status, 'under_inspection') then
    perform set_config('app.vehicle_status_reason', 'inspection started', true);
    update public.vehicles
    set
      status = 'under_inspection',
      updated_by = auth.uid()
    where id = v_vehicle.id;
  end if;

  -- Ensure checklist exists when template is set.
  if v_row.template_id is not null
     and not exists (select 1 from public.inspection_items where inspection_id = p_inspection_id) then
    perform public.populate_inspection_checklist(p_inspection_id);
    select * into v_row from public.inspections where id = p_inspection_id;
  end if;

  perform public.write_audit_log(
    'INSPECTION_STARTED',
    'inspections',
    p_inspection_id,
    jsonb_build_object('status', v_old),
    jsonb_build_object('status', 'in_progress', 'inspected_by', v_row.inspected_by),
    null
  );

  return v_row;
end;
$$;

create or replace function public.submit_inspection(
  p_inspection_id uuid,
  p_overall_result public.inspection_result default null,
  p_overall_score numeric default null,
  p_summary text default null,
  p_recommendation public.inspection_recommendation default null,
  p_notes text default null,
  p_override_incomplete boolean default false
)
returns public.inspections
language plpgsql
security definer
set search_path = public
as $$
declare
  v_row public.inspections%rowtype;
  v_incomplete int;
begin
  select * into v_row
  from public.inspections
  where id = p_inspection_id
  for update;

  if not found then
    raise exception 'inspection not found';
  end if;

  if not public.has_permission_for_branch('inspection.submit', v_row.branch_id)
     and not public.has_permission_for_branch('inspection.edit', v_row.branch_id) then
    raise exception 'not authorized';
  end if;

  if v_row.status is distinct from 'in_progress' then
    raise exception 'inspection must be in_progress to submit';
  end if;

  select count(*)::int into v_incomplete
  from public.inspection_items ii
  where ii.inspection_id = p_inspection_id
    and ii.is_required = true
    and (ii.result is null or ii.result = 'not_tested');

  if v_incomplete > 0 then
    if not p_override_incomplete then
      raise exception 'required checklist items incomplete (% remaining)', v_incomplete;
    end if;
    if not public.has_permission_for_branch('inspection.override', v_row.branch_id) then
      raise exception 'inspection.override required to submit incomplete checklist';
    end if;
  end if;

  if p_overall_score is not null and (p_overall_score < 0 or p_overall_score > 100) then
    raise exception 'overall_score must be between 0 and 100';
  end if;

  perform set_config('app.inspection_status_reason', 'submitted', true);

  update public.inspections
  set
    status = 'submitted',
    submitted_at = timezone('utc', now()),
    result = coalesce(p_overall_result, result),
    overall_score = coalesce(p_overall_score, overall_score),
    summary = coalesce(nullif(trim(p_summary), ''), summary),
    recommendation = coalesce(p_recommendation, recommendation),
    notes = coalesce(nullif(trim(p_notes), ''), notes),
    updated_by = auth.uid()
  where id = p_inspection_id
  returning * into v_row;

  -- Auto-advance to under_review.
  perform set_config('app.inspection_status_reason', 'submitted for review', true);
  update public.inspections
  set
    status = 'under_review',
    updated_by = auth.uid()
  where id = p_inspection_id
  returning * into v_row;

  perform public.write_audit_log(
    'INSPECTION_SUBMITTED',
    'inspections',
    p_inspection_id,
    jsonb_build_object('status', 'in_progress'),
    jsonb_build_object(
      'status', 'under_review',
      'result', v_row.result,
      'overall_score', v_row.overall_score,
      'override_incomplete', p_override_incomplete
    ),
    jsonb_build_object('incomplete_required_items', v_incomplete)
  );

  return v_row;
end;
$$;

create or replace function public.approve_inspection(
  p_inspection_id uuid,
  p_note text default null,
  p_override_critical boolean default false
)
returns public.inspections
language plpgsql
security definer
set search_path = public
as $$
declare
  v_row public.inspections%rowtype;
  v_critical int;
  v_vehicle public.vehicles%rowtype;
  v_target public.vehicle_status;
begin
  select * into v_row
  from public.inspections
  where id = p_inspection_id
  for update;

  if not found then
    raise exception 'inspection not found';
  end if;

  if not public.has_permission_for_branch('inspection.approve', v_row.branch_id) then
    raise exception 'not authorized';
  end if;

  if v_row.status is distinct from 'under_review' then
    raise exception 'inspection is not under review';
  end if;

  if not public.inspection_allows_self_approval()
     and (
       (v_row.inspected_by is not null and v_row.inspected_by = auth.uid())
       or (v_row.created_by is not null and v_row.created_by = auth.uid())
     ) then
    raise exception 'self approval is not allowed';
  end if;

  select count(*)::int into v_critical
  from public.inspection_findings f
  where f.inspection_id = p_inspection_id
    and f.severity = 'critical'
    and f.is_resolved = false;

  if v_critical > 0 then
    if not p_override_critical then
      raise exception 'unresolved critical findings (%); use override', v_critical;
    end if;
    if not public.has_permission_for_branch('inspection.override', v_row.branch_id) then
      raise exception 'inspection.override required to approve with critical findings';
    end if;
  end if;

  perform set_config(
    'app.inspection_status_reason',
    coalesce(nullif(trim(p_note), ''), 'approved'),
    true
  );

  update public.inspections
  set
    status = 'approved',
    reviewed_by = auth.uid(),
    reviewed_at = timezone('utc', now()),
    approved_at = timezone('utc', now()),
    completed_at = coalesce(completed_at, timezone('utc', now())),
    review_note = nullif(trim(coalesce(p_note, '')), ''),
    rejected_at = null,
    rejection_reason = null,
    updated_by = auth.uid()
  where id = p_inspection_id
  returning * into v_row;

  -- Vehicle status outcome based on overall result.
  select * into v_vehicle
  from public.vehicles
  where id = v_row.vehicle_id and deleted_at is null
  for update;

  if found and v_vehicle.status = 'under_inspection' then
    v_target := case
      when v_row.result in ('pass', 'pass_with_advisories') and v_critical = 0
        then 'ready_for_sale'::public.vehicle_status
      when v_row.result = 'repair_required'
        then 'under_repair'::public.vehicle_status
      when v_row.result = 'fail'
        then 'inspection_failed'::public.vehicle_status
      when v_row.result in ('pass', 'pass_with_advisories') and v_critical > 0
        then 'under_repair'::public.vehicle_status
      else null
    end;

    if v_target is not null
       and public.is_valid_vehicle_status_transition(v_vehicle.status, v_target) then
      perform set_config(
        'app.vehicle_status_reason',
        'inspection approved: ' || coalesce(v_row.result::text, 'no_result'),
        true
      );
      update public.vehicles
      set
        status = v_target,
        updated_by = auth.uid()
      where id = v_vehicle.id;
    end if;
  end if;

  perform public.write_audit_log(
    'INSPECTION_APPROVED',
    'inspections',
    p_inspection_id,
    jsonb_build_object('status', 'under_review'),
    jsonb_build_object(
      'status', 'approved',
      'reviewed_by', auth.uid(),
      'result', v_row.result,
      'vehicle_status', v_target
    ),
    jsonb_build_object(
      'note', nullif(trim(coalesce(p_note, '')), ''),
      'override_critical', p_override_critical,
      'unresolved_critical', v_critical
    )
  );

  return v_row;
end;
$$;

create or replace function public.reject_inspection(
  p_inspection_id uuid,
  p_reason text
)
returns public.inspections
language plpgsql
security definer
set search_path = public
as $$
declare
  v_row public.inspections%rowtype;
begin
  select * into v_row
  from public.inspections
  where id = p_inspection_id
  for update;

  if not found then
    raise exception 'inspection not found';
  end if;

  if not public.has_permission_for_branch('inspection.reject', v_row.branch_id)
     and not public.has_permission_for_branch('inspection.approve', v_row.branch_id) then
    raise exception 'not authorized';
  end if;

  if v_row.status is distinct from 'under_review' then
    raise exception 'inspection is not under review';
  end if;

  if p_reason is null or length(trim(p_reason)) = 0 then
    raise exception 'rejection reason required';
  end if;

  perform set_config('app.inspection_status_reason', trim(p_reason), true);

  update public.inspections
  set
    status = 'rejected',
    reviewed_by = auth.uid(),
    reviewed_at = timezone('utc', now()),
    rejected_at = timezone('utc', now()),
    rejection_reason = trim(p_reason),
    updated_by = auth.uid()
  where id = p_inspection_id
  returning * into v_row;

  perform public.write_audit_log(
    'INSPECTION_REJECTED',
    'inspections',
    p_inspection_id,
    jsonb_build_object('status', 'under_review'),
    jsonb_build_object('status', 'rejected', 'reviewed_by', auth.uid()),
    jsonb_build_object('reason', trim(p_reason))
  );

  return v_row;
end;
$$;

create or replace function public.cancel_inspection(
  p_inspection_id uuid,
  p_reason text
)
returns public.inspections
language plpgsql
security definer
set search_path = public
as $$
declare
  v_row public.inspections%rowtype;
  v_old public.inspection_status;
begin
  select * into v_row
  from public.inspections
  where id = p_inspection_id
  for update;

  if not found then
    raise exception 'inspection not found';
  end if;

  if not public.has_permission_for_branch('inspection.edit', v_row.branch_id) then
    raise exception 'not authorized';
  end if;

  if v_row.status = 'approved' then
    raise exception 'approved inspections cannot be cancelled';
  end if;

  if not public.is_valid_inspection_status_transition(v_row.status, 'cancelled') then
    raise exception 'invalid inspection status transition from % to cancelled', v_row.status
      using errcode = 'check_violation';
  end if;

  if p_reason is null or length(trim(p_reason)) = 0 then
    raise exception 'reason required';
  end if;

  v_old := v_row.status;
  perform set_config('app.inspection_status_reason', trim(p_reason), true);

  update public.inspections
  set
    status = 'cancelled',
    cancelled_at = timezone('utc', now()),
    cancel_reason = trim(p_reason),
    updated_by = auth.uid()
  where id = p_inspection_id
  returning * into v_row;

  perform public.write_audit_log(
    'INSPECTION_CANCELLED',
    'inspections',
    p_inspection_id,
    jsonb_build_object('status', v_old),
    jsonb_build_object('status', 'cancelled'),
    jsonb_build_object('reason', trim(p_reason))
  );

  return v_row;
end;
$$;

create or replace function public.request_reinspection(
  p_inspection_id uuid,
  p_reason text,
  p_assigned_to uuid default null
)
returns public.inspections
language plpgsql
security definer
set search_path = public
as $$
declare
  v_row public.inspections%rowtype;
  v_child public.inspections%rowtype;
  v_old public.inspection_status;
begin
  select * into v_row
  from public.inspections
  where id = p_inspection_id
  for update;

  if not found then
    raise exception 'inspection not found';
  end if;

  if not public.has_permission_for_branch('inspection.reinspect', v_row.branch_id)
     and not public.has_permission_for_branch('inspection.approve', v_row.branch_id) then
    raise exception 'not authorized';
  end if;

  if v_row.status not in ('under_review', 'rejected', 'approved') then
    raise exception 'reinspection not allowed from status %', v_row.status;
  end if;

  if p_reason is null or length(trim(p_reason)) = 0 then
    raise exception 'reason required';
  end if;

  v_old := v_row.status;

  -- From under_review: reject original then spawn child.
  if v_row.status = 'under_review' then
    perform set_config('app.inspection_status_reason', trim(p_reason), true);
    update public.inspections
    set
      status = 'rejected',
      reviewed_by = auth.uid(),
      reviewed_at = timezone('utc', now()),
      rejected_at = timezone('utc', now()),
      rejection_reason = trim(p_reason),
      updated_by = auth.uid()
    where id = p_inspection_id
    returning * into v_row;
  end if;

  insert into public.inspections (
    vehicle_id,
    template_id,
    branch_id,
    inspection_type,
    status,
    assigned_to,
    assigned_at,
    assigned_by,
    parent_inspection_id,
    notes,
    created_by,
    updated_by
  )
  values (
    v_row.vehicle_id,
    v_row.template_id,
    v_row.branch_id,
    're_inspection',
    case when p_assigned_to is not null then 'assigned'::public.inspection_status else 'draft'::public.inspection_status end,
    p_assigned_to,
    case when p_assigned_to is not null then timezone('utc', now()) else null end,
    case when p_assigned_to is not null then auth.uid() else null end,
    p_inspection_id,
    'Reinspection of ' || coalesce(v_row.inspection_number, p_inspection_id::text) || ': ' || trim(p_reason),
    auth.uid(),
    auth.uid()
  )
  returning * into v_child;

  if v_child.template_id is not null then
    perform public.populate_inspection_checklist(v_child.id);
    select * into v_child from public.inspections where id = v_child.id;
  end if;

  perform public.write_audit_log(
    'INSPECTION_REINSPECTION_REQUESTED',
    'inspections',
    p_inspection_id,
    jsonb_build_object('status', v_old),
    jsonb_build_object(
      'status', v_row.status,
      'child_inspection_id', v_child.id,
      'child_inspection_number', v_child.inspection_number
    ),
    jsonb_build_object('reason', trim(p_reason), 'assigned_to', p_assigned_to)
  );

  return v_child;
end;
$$;

revoke all on function public.inspection_section_display_name(text) from public;
revoke all on function public.populate_inspection_checklist(uuid) from public;
revoke all on function public.read_inspection_costs(uuid) from public;
revoke all on function public.change_inspection_status(uuid, public.inspection_status, text) from public;
revoke all on function public.assign_inspection(uuid, uuid, text) from public;
revoke all on function public.start_inspection(uuid) from public;
revoke all on function public.submit_inspection(uuid, public.inspection_result, numeric, text, public.inspection_recommendation, text, boolean) from public;
revoke all on function public.approve_inspection(uuid, text, boolean) from public;
revoke all on function public.reject_inspection(uuid, text) from public;
revoke all on function public.cancel_inspection(uuid, text) from public;
revoke all on function public.request_reinspection(uuid, text, uuid) from public;
revoke all on function public.is_valid_inspection_status_transition(public.inspection_status, public.inspection_status) from public;
revoke all on function public.inspection_allows_self_approval() from public;

grant execute on function public.inspection_section_display_name(text) to authenticated, service_role;
grant execute on function public.populate_inspection_checklist(uuid) to authenticated, service_role;
grant execute on function public.read_inspection_costs(uuid) to authenticated, service_role;
grant execute on function public.change_inspection_status(uuid, public.inspection_status, text) to authenticated, service_role;
grant execute on function public.assign_inspection(uuid, uuid, text) to authenticated, service_role;
grant execute on function public.start_inspection(uuid) to authenticated, service_role;
grant execute on function public.submit_inspection(uuid, public.inspection_result, numeric, text, public.inspection_recommendation, text, boolean) to authenticated, service_role;
grant execute on function public.approve_inspection(uuid, text, boolean) to authenticated, service_role;
grant execute on function public.reject_inspection(uuid, text) to authenticated, service_role;
grant execute on function public.cancel_inspection(uuid, text) to authenticated, service_role;
grant execute on function public.request_reinspection(uuid, text, uuid) to authenticated, service_role;
grant execute on function public.is_valid_inspection_status_transition(public.inspection_status, public.inspection_status) to authenticated, service_role;
grant execute on function public.inspection_allows_self_approval() to authenticated, service_role;

revoke all on function public.write_audit_log(text, text, uuid, jsonb, jsonb, jsonb) from public;
grant execute on function public.write_audit_log(text, text, uuid, jsonb, jsonb, jsonb) to authenticated, service_role;

-- Cost column protection
do $$
begin
  grant select, insert, update, delete on public.inspection_findings to authenticated;
  grant select, insert, update, delete on public.inspection_recommendations to authenticated;
  grant select, insert, update, delete on public.inspection_sections to authenticated;
  grant select on public.inspection_status_history to authenticated;
  revoke select (estimated_cost) on public.inspection_findings from authenticated;
  revoke select (estimated_cost) on public.inspection_recommendations from authenticated;
exception when undefined_object then
  raise notice 'Skipping inspection cost column revoke (role/grants not present yet)';
when others then
  raise notice 'Inspection grant/revoke adjustment skipped: %', sqlerrm;
end $$;

-- ---------------------------------------------------------------------------
-- Permissions
-- ---------------------------------------------------------------------------

insert into public.permissions (key, name, module, description)
values
  ('inspection.submit', 'Submit inspections', 'inspection', 'Submit completed inspections for review'),
  ('inspection.review', 'Review inspections', 'inspection', 'Move inspections into review and manage review queue'),
  ('inspection.reject', 'Reject inspections', 'inspection', 'Reject inspections under review'),
  ('inspection.reinspect', 'Request reinspection', 'inspection', 'Create a follow-up reinspection from an existing inspection'),
  ('inspection.finding.view', 'View inspection findings', 'inspection', 'View inspection findings and damage details'),
  ('inspection.finding.create', 'Create inspection findings', 'inspection', 'Create inspection findings'),
  ('inspection.finding.edit', 'Edit inspection findings', 'inspection', 'Edit or resolve inspection findings'),
  ('inspection.photo.view', 'View inspection photos', 'inspection', 'View inspection photo metadata'),
  ('inspection.photo.create', 'Upload inspection photos', 'inspection', 'Upload inspection photos'),
  ('inspection.photo.delete', 'Delete inspection photos', 'inspection', 'Delete inspection photos'),
  ('inspection.cost.view', 'View inspection costs', 'inspection', 'View estimated repair costs on findings/recommendations'),
  ('inspection.override', 'Override inspection gates', 'inspection', 'Override incomplete checklist or critical-finding approval gates')
on conflict (key) do update
set
  name = excluded.name,
  module = excluded.module,
  description = excluded.description;

-- Super admin: all inspection.* keys
insert into public.role_permissions (role_id, permission_id)
select r.id, p.id
from public.roles r
cross join public.permissions p
where r.key = 'super_admin'
  and p.key like 'inspection.%'
on conflict do nothing;

-- Admin: all inspection.* keys
insert into public.role_permissions (role_id, permission_id)
select r.id, p.id
from public.roles r
cross join public.permissions p
where r.key = 'admin'
  and p.key like 'inspection.%'
on conflict do nothing;

-- General manager: full inspection workflow including approve/reject/override/cost
insert into public.role_permissions (role_id, permission_id)
select r.id, p.id
from public.roles r
join public.permissions p on p.key in (
  'inspection.view', 'inspection.create', 'inspection.edit', 'inspection.approve',
  'inspection.submit', 'inspection.review', 'inspection.reject', 'inspection.reinspect',
  'inspection.finding.view', 'inspection.finding.create', 'inspection.finding.edit',
  'inspection.photo.view', 'inspection.photo.create', 'inspection.photo.delete',
  'inspection.cost.view', 'inspection.override'
)
where r.key = 'general_manager'
on conflict do nothing;

-- Remove approve from inspector (Phase 7: inspectors cannot approve)
delete from public.role_permissions rp
using public.roles r, public.permissions p
where rp.role_id = r.id
  and rp.permission_id = p.id
  and r.key = 'inspector'
  and p.key = 'inspection.approve';

-- Inspector: operational checklist work, no approve/reject/override/cost
insert into public.role_permissions (role_id, permission_id)
select r.id, p.id
from public.roles r
join public.permissions p on p.key in (
  'inspection.view', 'inspection.create', 'inspection.edit', 'inspection.submit',
  'inspection.finding.view', 'inspection.finding.create', 'inspection.finding.edit',
  'inspection.photo.view', 'inspection.photo.create'
)
where r.key = 'inspector'
on conflict do nothing;

-- Inventory manager: view + cost
insert into public.role_permissions (role_id, permission_id)
select r.id, p.id
from public.roles r
join public.permissions p on p.key in (
  'inspection.view',
  'inspection.cost.view',
  'inspection.finding.view',
  'inspection.photo.view'
)
where r.key = 'inventory_manager'
on conflict do nothing;

-- Workshop manager: view
insert into public.role_permissions (role_id, permission_id)
select r.id, p.id
from public.roles r
join public.permissions p on p.key in (
  'inspection.view',
  'inspection.finding.view',
  'inspection.photo.view'
)
where r.key = 'workshop_manager'
on conflict do nothing;

-- Sales executive: view only (no cost)
insert into public.role_permissions (role_id, permission_id)
select r.id, p.id
from public.roles r
join public.permissions p on p.key in (
  'inspection.view',
  'inspection.finding.view',
  'inspection.photo.view'
)
where r.key = 'sales_executive'
on conflict do nothing;

-- Viewer: view
insert into public.role_permissions (role_id, permission_id)
select r.id, p.id
from public.roles r
join public.permissions p on p.key in (
  'inspection.view',
  'inspection.finding.view',
  'inspection.photo.view'
)
where r.key = 'viewer'
on conflict do nothing;

-- ---------------------------------------------------------------------------
-- Seed Full + Basic inspection templates
-- ---------------------------------------------------------------------------

do $$
declare
  v_full_id uuid;
  v_basic_id uuid;
begin
  select id into v_full_id
  from public.inspection_templates
  where name = 'Full Vehicle Inspection'
  limit 1;

  if v_full_id is null then
    insert into public.inspection_templates (name, description, is_active, inspection_type)
    values (
      'Full Vehicle Inspection',
      'Comprehensive pre-sale checklist covering identity, body, mechanical, safety, and road test.',
      true,
      'full_inspection'
    )
    returning id into v_full_id;
  else
    update public.inspection_templates
    set
      inspection_type = 'full_inspection',
      is_active = true,
      description = coalesce(description, 'Comprehensive pre-sale checklist.')
    where id = v_full_id;
  end if;

  insert into public.inspection_template_items (
    template_id, section_key, name, category, description, sort_order, is_required
  )
  select v_full_id, x.section_key, x.name, x.category, x.description, x.sort_order, x.is_required
  from (values
    ('vehicle_identity', 'VIN plate verification', 'Vehicle Identity', 'Verify VIN plate matches documents', 10, true),
    ('vehicle_identity', 'Chassis stamp check', 'Vehicle Identity', 'Confirm chassis stamp matches VIN', 20, true),
    ('vehicle_identity', 'Engine number check', 'Vehicle Identity', 'Verify engine number vs records', 30, true),
    ('vehicle_identity', 'Number plate / registration match', 'Vehicle Identity', 'Confirm plates match registration', 40, true),
    ('vehicle_identity', 'Odometer reading recorded', 'Vehicle Identity', 'Record and photograph odometer', 50, true),
    ('vehicle_identity', 'Key set completeness', 'Vehicle Identity', 'Check master/spare keys and remotes', 60, false),
    ('exterior', 'Front bumper condition', 'Exterior', 'Check cracks, dents, paint, alignment', 100, true),
    ('exterior', 'Rear bumper condition', 'Exterior', 'Check cracks, dents, paint, alignment', 110, true),
    ('exterior', 'Hood / bonnet panels', 'Exterior', 'Check dents, gaps, prior repair', 120, true),
    ('exterior', 'Roof condition', 'Exterior', 'Check dents, hail, paint quality', 130, true),
    ('exterior', 'Left side panels', 'Exterior', 'Doors, fenders, trim, scratches', 140, true),
    ('exterior', 'Right side panels', 'Exterior', 'Doors, fenders, trim, scratches', 150, true),
    ('exterior', 'Paint consistency', 'Exterior', 'Check respray, overspray, colour match', 160, true),
    ('exterior', 'Glass and mirrors', 'Exterior', 'Windscreen chips, mirrors, seals', 170, true),
    ('exterior', 'Door alignment / gaps', 'Exterior', 'Uniform panel gaps and latch fit', 180, true),
    ('exterior', 'Boot / trunk condition', 'Exterior', 'Panel fit, weather seals, latch', 190, false),
    ('interior', 'Seat condition', 'Interior', 'Wear, tears, staining, electric functions', 200, true),
    ('interior', 'Dashboard and trim', 'Interior', 'Cracks, fading, rattles, fit', 210, true),
    ('interior', 'Carpet and headliner', 'Interior', 'Stains, odours, water marks', 220, true),
    ('interior', 'Controls and switches', 'Interior', 'Windows, locks, mirrors, stalks', 230, true),
    ('interior', 'Infotainment / cluster', 'Interior', 'Screen, radio, warning lamps', 240, true),
    ('interior', 'Cabin odour / smoke', 'Interior', 'Smoke, mildew, chemical odours', 250, false),
    ('engine', 'Cold / hot start quality', 'Engine', 'Start behaviour and idle stability', 300, true),
    ('engine', 'Unusual noises / vibration', 'Engine', 'Knock, tick, belt noise, mounts', 310, true),
    ('engine', 'Oil leaks / seepage', 'Engine', 'Valve cover, sump, seals', 320, true),
    ('engine', 'Coolant leaks / residue', 'Engine', 'Radiator, hoses, water pump', 330, true),
    ('engine', 'Belt and pulley condition', 'Engine', 'Cracks, tension, alignment', 340, true),
    ('engine', 'Air filter / intake condition', 'Engine', 'Restriction, contamination', 350, false),
    ('engine', 'Exhaust smoke on start', 'Engine', 'Colour and duration of smoke', 360, true),
    ('transmission', 'Gear engagement quality', 'Transmission', 'Smooth select, no grinding', 400, true),
    ('transmission', 'Clutch / torque converter feel', 'Transmission', 'Slip, shudder, engagement point', 410, true),
    ('transmission', 'Transmission fluid condition', 'Transmission', 'Level, colour, burnt smell', 420, true),
    ('transmission', 'Driveshaft / CV joint noise', 'Transmission', 'Clicking, vibration under load', 430, true),
    ('electrical', 'Battery health / terminals', 'Electrical', 'Voltage, corrosion, hold-down', 500, true),
    ('electrical', 'Charging system', 'Electrical', 'Alternator output, warning lamp', 510, true),
    ('electrical', 'Starter operation', 'Electrical', 'Crank speed and reliability', 520, true),
    ('electrical', 'Wiring loom condition', 'Electrical', 'Chafing, aftermarket splices', 530, false),
    ('electrical', 'Warning lights present', 'Electrical', 'ABS, airbag, engine, TPMS etc.', 540, true),
    ('air_conditioning', 'AC cooling performance', 'Air Conditioning', 'Vent temperature and airflow', 600, true),
    ('air_conditioning', 'Heater performance', 'Air Conditioning', 'Cabin heat output', 610, true),
    ('air_conditioning', 'Blower and vents', 'Air Conditioning', 'Fan speeds, mode doors, odours', 620, true),
    ('air_conditioning', 'Compressor / clutch noise', 'Air Conditioning', 'Engage noise, cycling behaviour', 630, false),
    ('brakes', 'Brake pedal feel', 'Brakes', 'Travel, firmness, fade', 700, true),
    ('brakes', 'Disc / drum condition', 'Brakes', 'Scoring, thickness, rust lip', 710, true),
    ('brakes', 'Pad / shoe remaining life', 'Brakes', 'Estimate remaining material', 720, true),
    ('brakes', 'ABS / ESP operation', 'Brakes', 'Lamp behaviour and function', 730, true),
    ('brakes', 'Handbrake / EPB hold', 'Brakes', 'Holding strength on incline', 740, true),
    ('suspension', 'Shock absorber condition', 'Suspension', 'Leakage, bounce, noise', 800, true),
    ('suspension', 'Springs and mounts', 'Suspension', 'Sag, cracks, perch condition', 810, true),
    ('suspension', 'Bushes and ball joints', 'Suspension', 'Play, cracking, wear', 820, true),
    ('suspension', 'Ride height symmetry', 'Suspension', 'Left/right and front/rear height', 830, false),
    ('steering', 'Steering play / centre feel', 'Steering', 'On-centre response and free play', 900, true),
    ('steering', 'Power assist operation', 'Steering', 'Noise, assistance at idle', 910, true),
    ('steering', 'Tie rods / rack boots', 'Steering', 'Play, torn boots, leaks', 920, true),
    ('tyres_wheels', 'Tread depth all corners', 'Tyres Wheels', 'Measure and record mm', 1000, true),
    ('tyres_wheels', 'Sidewall / puncture damage', 'Tyres Wheels', 'Cuts, bulges, plugs', 1010, true),
    ('tyres_wheels', 'Uneven wear pattern', 'Tyres Wheels', 'Camber, toe, inflation wear', 1020, true),
    ('tyres_wheels', 'Wheel rim condition', 'Tyres Wheels', 'Kerbing, cracks, corrosion', 1030, true),
    ('tyres_wheels', 'Spare / repair kit present', 'Tyres Wheels', 'Spare tyre or kit condition', 1040, false),
    ('tyres_wheels', 'TPMS function', 'Tyres Wheels', 'Sensors and warning lamp', 1050, false),
    ('fluids', 'Engine oil level / condition', 'Fluids', 'Level and contamination', 1100, true),
    ('fluids', 'Coolant level / condition', 'Fluids', 'Level and contamination', 1110, true),
    ('fluids', 'Brake fluid level / condition', 'Fluids', 'Level and moisture colour', 1120, true),
    ('fluids', 'Washer / power steering fluids', 'Fluids', 'Levels and leaks', 1130, false),
    ('lights', 'Headlights / high beam', 'Lights', 'Aim, brightness, cracks', 1200, true),
    ('lights', 'Indicators / hazards', 'Lights', 'All corners flash correctly', 1210, true),
    ('lights', 'Brake / reverse / fog lamps', 'Lights', 'Function and lenses', 1220, true),
    ('lights', 'Number plate / cabin lights', 'Lights', 'Illumination function', 1230, false),
    ('safety', 'Seatbelts and pretensioners', 'Safety', 'Latch, retract, warning lamp', 1300, true),
    ('safety', 'Airbag system status', 'Safety', 'Lamp cycle and history', 1310, true),
    ('safety', 'Horn operation', 'Safety', 'Audible and reliable', 1320, true),
    ('safety', 'Child lock / ISOFIX points', 'Safety', 'Where applicable', 1330, false),
    ('undercarriage', 'Floorpan / sill condition', 'Undercarriage', 'Rust, impact, weld repairs', 1400, true),
    ('undercarriage', 'Exhaust system condition', 'Undercarriage', 'Mounts, leaks, corrosion', 1410, true),
    ('undercarriage', 'Fuel / brake line condition', 'Undercarriage', 'Corrosion, chafing, leaks', 1420, true),
    ('undercarriage', 'Undershield / splash guards', 'Undercarriage', 'Missing or damaged covers', 1430, false),
    ('accident_damage', 'Structural rail integrity', 'Accident Damage', 'Visible rail/frame damage', 1500, true),
    ('accident_damage', 'Prior accident indicators', 'Accident Damage', 'Bond lines, clips, foam mismatch', 1510, true),
    ('accident_damage', 'Airbag deployment history', 'Accident Damage', 'Covers, modules, replacements', 1520, true),
    ('accident_damage', 'Paint thickness anomalies', 'Accident Damage', 'Gauge readings where available', 1530, false),
    ('road_test', 'Acceleration / power delivery', 'Road Test', 'Hesitation, misfire, lag', 1600, true),
    ('road_test', 'Braking in motion', 'Road Test', 'Pull, pulsation, noise', 1610, true),
    ('road_test', 'Steering tracking', 'Road Test', 'Pull or wander on flat road', 1620, true),
    ('road_test', 'Noise / vibration at speed', 'Road Test', 'Driveline or wheel vibration', 1630, true),
    ('road_test', 'Transmission shift quality', 'Road Test', 'Harshness, flare, delay', 1640, true),
    ('documents', 'Registration / mulkiya present', 'Documents', 'Valid registration documents', 1700, true),
    ('documents', 'Service history available', 'Documents', 'Stamps, invoices, digital history', 1710, false),
    ('documents', 'Insurance / export papers', 'Documents', 'Where applicable', 1720, false),
    ('final_assessment', 'Overall safety assessment', 'Final Assessment', 'Roadworthiness judgement', 1800, true),
    ('final_assessment', 'Sale readiness assessment', 'Final Assessment', 'Ready, repair, or reject', 1810, true),
    ('final_assessment', 'Recommended next actions', 'Final Assessment', 'Repair / reinspect / monitor', 1820, true)
  ) as x(section_key, name, category, description, sort_order, is_required)
  where not exists (
    select 1 from public.inspection_template_items i
    where i.template_id = v_full_id
      and i.name = x.name
      and i.section_key = x.section_key
  );

  select id into v_basic_id
  from public.inspection_templates
  where name = 'Basic Vehicle Inspection'
  limit 1;

  if v_basic_id is null then
    insert into public.inspection_templates (name, description, is_active, inspection_type)
    values (
      'Basic Vehicle Inspection',
      'Shorter checklist for quick intake or low-risk vehicles.',
      true,
      'basic_inspection'
    )
    returning id into v_basic_id;
  else
    update public.inspection_templates
    set inspection_type = 'basic_inspection', is_active = true
    where id = v_basic_id;
  end if;

  insert into public.inspection_template_items (
    template_id, section_key, name, category, description, sort_order, is_required
  )
  select v_basic_id, x.section_key, x.name, x.category, x.description, x.sort_order, x.is_required
  from (values
    ('vehicle_identity', 'VIN verification', 'Vehicle Identity', 'Confirm VIN matches documents', 10, true),
    ('vehicle_identity', 'Odometer reading', 'Vehicle Identity', 'Record odometer', 20, true),
    ('exterior', 'Body panel overview', 'Exterior', 'Major dents, rust, accident signs', 100, true),
    ('exterior', 'Glass and lights', 'Exterior', 'Windscreen and exterior lights', 110, true),
    ('interior', 'Cabin condition', 'Interior', 'Seats, trim, controls overview', 200, true),
    ('engine', 'Engine start and idle', 'Engine', 'Start quality and obvious leaks', 300, true),
    ('transmission', 'Gear engagement check', 'Transmission', 'Basic shift / select test', 400, true),
    ('brakes', 'Brake pedal and hold', 'Brakes', 'Pedal feel and handbrake', 500, true),
    ('tyres_wheels', 'Tyre and rim condition', 'Tyres Wheels', 'Tread and obvious damage', 600, true),
    ('electrical', 'Warning lights check', 'Electrical', 'Cluster warning lamps', 700, true),
    ('safety', 'Seatbelts and airbag lamp', 'Safety', 'Restraint system status', 800, true),
    ('road_test', 'Short drive assessment', 'Road Test', 'Noise, pull, braking feel', 900, true),
    ('final_assessment', 'Overall pass / fail judgement', 'Final Assessment', 'Basic sale readiness', 1000, true)
  ) as x(section_key, name, category, description, sort_order, is_required)
  where not exists (
    select 1 from public.inspection_template_items i
    where i.template_id = v_basic_id
      and i.name = x.name
      and i.section_key = x.section_key
  );

  -- Align legacy Standard Pre-Sale template type if present.
  update public.inspection_templates
  set inspection_type = coalesce(inspection_type, 'full_inspection')
  where name = 'Standard Pre-Sale Inspection';
end $$;

-- ---------------------------------------------------------------------------
-- RLS policies
-- ---------------------------------------------------------------------------

-- Sections
drop policy if exists inspection_sections_select on public.inspection_sections;
create policy "inspection_sections_select"
  on public.inspection_sections for select to authenticated
  using (
    exists (
      select 1 from public.inspections i
      where i.id = inspection_id
        and public.has_permission_for_branch('inspection.view', i.branch_id)
    )
  );

drop policy if exists inspection_sections_mutate on public.inspection_sections;
create policy "inspection_sections_mutate"
  on public.inspection_sections for all to authenticated
  using (
    exists (
      select 1 from public.inspections i
      where i.id = inspection_id
        and public.has_permission_for_branch('inspection.edit', i.branch_id)
    )
  )
  with check (
    exists (
      select 1 from public.inspections i
      where i.id = inspection_id
        and public.has_permission_for_branch('inspection.edit', i.branch_id)
    )
  );

-- Findings
drop policy if exists inspection_findings_select on public.inspection_findings;
create policy "inspection_findings_select"
  on public.inspection_findings for select to authenticated
  using (
    exists (
      select 1 from public.inspections i
      where i.id = inspection_id
        and (
          public.has_permission_for_branch('inspection.finding.view', i.branch_id)
          or public.has_permission_for_branch('inspection.view', i.branch_id)
        )
    )
  );

drop policy if exists inspection_findings_insert on public.inspection_findings;
create policy "inspection_findings_insert"
  on public.inspection_findings for insert to authenticated
  with check (
    exists (
      select 1 from public.inspections i
      where i.id = inspection_id
        and (
          public.has_permission_for_branch('inspection.finding.create', i.branch_id)
          or public.has_permission_for_branch('inspection.edit', i.branch_id)
        )
    )
  );

drop policy if exists inspection_findings_update on public.inspection_findings;
create policy "inspection_findings_update"
  on public.inspection_findings for update to authenticated
  using (
    exists (
      select 1 from public.inspections i
      where i.id = inspection_id
        and (
          public.has_permission_for_branch('inspection.finding.edit', i.branch_id)
          or public.has_permission_for_branch('inspection.edit', i.branch_id)
        )
    )
  )
  with check (
    exists (
      select 1 from public.inspections i
      where i.id = inspection_id
        and (
          public.has_permission_for_branch('inspection.finding.edit', i.branch_id)
          or public.has_permission_for_branch('inspection.edit', i.branch_id)
        )
    )
  );

drop policy if exists inspection_findings_delete on public.inspection_findings;
create policy "inspection_findings_delete"
  on public.inspection_findings for delete to authenticated
  using (
    exists (
      select 1 from public.inspections i
      where i.id = inspection_id
        and (
          public.has_permission_for_branch('inspection.finding.edit', i.branch_id)
          or public.has_permission_for_branch('inspection.edit', i.branch_id)
        )
    )
  );

-- Recommendations
drop policy if exists inspection_recommendations_select on public.inspection_recommendations;
create policy "inspection_recommendations_select"
  on public.inspection_recommendations for select to authenticated
  using (
    exists (
      select 1 from public.inspections i
      where i.id = inspection_id
        and public.has_permission_for_branch('inspection.view', i.branch_id)
    )
  );

drop policy if exists inspection_recommendations_mutate on public.inspection_recommendations;
create policy "inspection_recommendations_mutate"
  on public.inspection_recommendations for all to authenticated
  using (
    exists (
      select 1 from public.inspections i
      where i.id = inspection_id
        and public.has_permission_for_branch('inspection.edit', i.branch_id)
    )
  )
  with check (
    exists (
      select 1 from public.inspections i
      where i.id = inspection_id
        and public.has_permission_for_branch('inspection.edit', i.branch_id)
    )
  );

-- Status history (select only)
drop policy if exists inspection_status_history_select on public.inspection_status_history;
create policy "inspection_status_history_select"
  on public.inspection_status_history for select to authenticated
  using (
    exists (
      select 1 from public.inspections i
      where i.id = inspection_id
        and public.has_permission_for_branch('inspection.view', i.branch_id)
    )
  );

-- Refresh photo policies for granular photo.* permissions
drop policy if exists inspection_photos_select on public.inspection_photos;
create policy "inspection_photos_select"
  on public.inspection_photos for select to authenticated
  using (
    exists (
      select 1 from public.inspections i
      where i.id = inspection_id
        and (
          public.has_permission_for_branch('inspection.photo.view', i.branch_id)
          or public.has_permission_for_branch('inspection.view', i.branch_id)
        )
    )
  );

drop policy if exists inspection_photos_mutate on public.inspection_photos;
drop policy if exists inspection_photos_insert on public.inspection_photos;
create policy "inspection_photos_insert"
  on public.inspection_photos for insert to authenticated
  with check (
    exists (
      select 1 from public.inspections i
      where i.id = inspection_id
        and (
          public.has_permission_for_branch('inspection.photo.create', i.branch_id)
          or public.has_permission_for_branch('inspection.edit', i.branch_id)
          or public.has_permission_for_branch('inspection.create', i.branch_id)
        )
    )
  );

drop policy if exists inspection_photos_update on public.inspection_photos;
create policy "inspection_photos_update"
  on public.inspection_photos for update to authenticated
  using (
    exists (
      select 1 from public.inspections i
      where i.id = inspection_id
        and (
          public.has_permission_for_branch('inspection.photo.create', i.branch_id)
          or public.has_permission_for_branch('inspection.edit', i.branch_id)
        )
    )
  )
  with check (
    exists (
      select 1 from public.inspections i
      where i.id = inspection_id
        and (
          public.has_permission_for_branch('inspection.photo.create', i.branch_id)
          or public.has_permission_for_branch('inspection.edit', i.branch_id)
        )
    )
  );

drop policy if exists inspection_photos_delete on public.inspection_photos;
create policy "inspection_photos_delete"
  on public.inspection_photos for delete to authenticated
  using (
    exists (
      select 1 from public.inspections i
      where i.id = inspection_id
        and (
          public.has_permission_for_branch('inspection.photo.delete', i.branch_id)
          or public.has_permission_for_branch('inspection.edit', i.branch_id)
        )
    )
  );

-- Keep item mutate aligned with edit (existing policy from 00027 remains valid).
-- Extend inspections_update to include submit/review/reject permissions.
drop policy if exists inspections_update on public.inspections;
create policy "inspections_update"
  on public.inspections for update to authenticated
  using (
    public.has_permission_for_branch('inspection.edit', branch_id)
    or public.has_permission_for_branch('inspection.approve', branch_id)
    or public.has_permission_for_branch('inspection.submit', branch_id)
    or public.has_permission_for_branch('inspection.review', branch_id)
    or public.has_permission_for_branch('inspection.reject', branch_id)
  )
  with check (
    public.has_permission_for_branch('inspection.edit', branch_id)
    or public.has_permission_for_branch('inspection.approve', branch_id)
    or public.has_permission_for_branch('inspection.submit', branch_id)
    or public.has_permission_for_branch('inspection.review', branch_id)
    or public.has_permission_for_branch('inspection.reject', branch_id)
  );

-- ---------------------------------------------------------------------------
-- Comments (Phase 7)
-- ---------------------------------------------------------------------------

comment on table public.inspection_sections is
  'Per-inspection checklist section snapshot copied from the template at populate time.';
comment on table public.inspection_findings is
  'Defects/advisories discovered during inspection. estimated_cost is restricted; use read_inspection_costs.';
comment on table public.inspection_recommendations is
  'Overall or finding-level recommendations. estimated_cost is restricted; use read_inspection_costs.';
comment on table public.inspection_status_history is
  'Append-only inspection workflow status changes (from_status → to_status).';
comment on column public.inspections.inspection_number is
  'Dealership inspection reference, e.g. ZM-INSP-000001.';
comment on column public.inspections.inspected_by is
  'Primary inspector who performed the work. Legacy inspector_id is retained for compatibility.';
comment on column public.inspections.parent_inspection_id is
  'Links a re_inspection child to its parent inspection.';
comment on column public.inspections.result is
  'Overall inspection result (pass / pass_with_advisories / repair_required / fail).';
comment on column public.inspection_findings.estimated_cost is
  'Sensitive estimated repair cost — access via read_inspection_costs.';
comment on column public.inspection_findings.is_critical is
  'Generated true when severity = critical.';
comment on function public.is_valid_inspection_status_transition is
  'Phase 7 inspection workflow transition matrix.';
comment on function public.populate_inspection_checklist is
  'Copies template sections/items onto an inspection as not_tested checklist rows.';
comment on function public.submit_inspection is
  'in_progress → submitted → under_review; validates required items unless override.';
comment on function public.approve_inspection is
  'under_review → approved; may advance vehicle to ready_for_sale / under_repair / inspection_failed.';
comment on function public.request_reinspection is
  'Creates child re_inspection; rejects parent when requested from under_review.';
