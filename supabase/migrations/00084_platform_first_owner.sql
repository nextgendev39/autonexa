-- The first platform owner, created from the setup page. Atomic: the check and the insert happen
-- under one lock, so two requests at once can't both become the first owner. Once any owner exists it
-- does nothing, for good. Further staff are invited from the console. Changes no row by itself.
-- Rollback: supabase/rollbacks/00084_platform_first_owner_down.sql

create function public.platform_claim_first_owner(p_user_id uuid)
returns boolean
language plpgsql
security definer
set search_path = public
as $$
begin
  perform pg_advisory_xact_lock(hashtextextended('platform:first_owner', 0));
  if exists (select 1 from public.platform_admins where role = 'owner') then
    return false;
  end if;
  -- platform_admins_guard refuses a login that belongs to a dealership.
  insert into public.platform_admins (user_id, role) values (p_user_id, 'owner');
  perform public.platform_log('platform.first_owner_created', 'platform_admins', p_user_id, null);
  return true;
end;
$$;

revoke all on function public.platform_claim_first_owner(uuid) from public, anon, authenticated;
grant execute on function public.platform_claim_first_owner(uuid) to service_role;
