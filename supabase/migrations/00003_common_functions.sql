-- Shared helpers: updated_at maintenance and current profile id.

create or replace function public.set_updated_at()
returns trigger
language plpgsql
as $$
begin
  new.updated_at = timezone('utc', now());
  return new;
end;
$$;

comment on function public.set_updated_at() is
  'Sets updated_at to UTC now() on row update. Applied by triggers; never rely on the client.';

create or replace function public.current_profile_id()
returns uuid
language sql
stable
as $$
  select auth.uid();
$$;

comment on function public.current_profile_id() is
  'Authenticated profile id. profiles.id mirrors auth.users.id.';
