-- Staff profiles. Authentication credentials live only in auth.users.
-- profiles.id === auth.users.id (standard Supabase pattern).

create table public.profiles (
  id uuid primary key references auth.users (id) on delete cascade,
  employee_code text,
  first_name text not null,
  last_name text not null,
  display_name text not null,
  phone text,
  avatar_url text,
  branch_id uuid references public.branches (id) on delete set null,
  status public.user_status not null default 'invited',
  deleted_at timestamptz,
  deleted_by uuid,
  created_at timestamptz not null default timezone('utc', now()),
  updated_at timestamptz not null default timezone('utc', now()),
  constraint profiles_employee_code_unique unique (employee_code),
  constraint profiles_first_name_not_blank check (length(trim(first_name)) > 0),
  constraint profiles_last_name_not_blank check (length(trim(last_name)) > 0),
  constraint profiles_display_name_not_blank check (length(trim(display_name)) > 0)
);

alter table public.branches
  add constraint branches_manager_user_id_fkey
  foreign key (manager_user_id) references public.profiles (id) on delete set null;

alter table public.profiles
  add constraint profiles_deleted_by_fkey
  foreign key (deleted_by) references public.profiles (id) on delete set null;

create trigger profiles_set_updated_at
before update on public.profiles
for each row execute function public.set_updated_at();

-- Auto-create a minimal profile when a user is invited/signed up.
create or replace function public.handle_new_user()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  full_name text;
begin
  full_name := coalesce(
    nullif(trim(new.raw_user_meta_data ->> 'full_name'), ''),
    nullif(trim(new.raw_user_meta_data ->> 'name'), ''),
    split_part(coalesce(new.email, 'user'), '@', 1)
  );

  insert into public.profiles (
    id,
    first_name,
    last_name,
    display_name,
    phone,
    status
  )
  values (
    new.id,
    coalesce(nullif(trim(new.raw_user_meta_data ->> 'first_name'), ''), full_name),
    coalesce(nullif(trim(new.raw_user_meta_data ->> 'last_name'), ''), '-'),
    full_name,
    nullif(trim(new.raw_user_meta_data ->> 'phone'), ''),
    'invited'
  )
  on conflict (id) do nothing;

  return new;
end;
$$;

drop trigger if exists on_auth_user_created on auth.users;
create trigger on_auth_user_created
after insert on auth.users
for each row execute function public.handle_new_user();

comment on table public.profiles is
  'Staff identity linked 1:1 with auth.users. Soft-deleted with deleted_at.';
