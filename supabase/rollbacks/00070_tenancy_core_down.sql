-- Rollback of 00070. Run manually, only with approval, after 00071's rollback.
do $$
begin
  if exists (select 1 from public.tenants where id <> '00000000-0000-4000-8000-000000000001') then
    raise exception 'Refusing to roll back: a second dealership exists.';
  end if;
end;
$$;

-- Stock and acquisition numbers issued since 00070 must not be reused by the old sequences.
select setval('public.vehicle_stock_number_seq', c.value)
from public.tenant_counters c where c.key = 'vehicle_stock' and c.value > 0;
select setval('public.acquisition_number_seq', c.value)
from public.tenant_counters c where c.key = 'acquisition' and c.value > 0;

-- Tables first: their policies depend on current_tenant_id().
drop table public.tenant_counters;
drop table public.platform_admins;
drop table public.tenant_members;
drop table public.tenants;
drop function public.resolve_insert_tenant_id();
drop function public.is_platform_admin();
drop function public.current_tenant_id();
