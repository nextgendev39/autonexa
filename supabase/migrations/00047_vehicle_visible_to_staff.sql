-- Per-vehicle control (Super Admin) over whether non-Super-Admin roles can see
-- a vehicle while it is In transit (status = acquired). Ignored for other statuses.
alter table public.vehicles
  add column if not exists visible_to_staff boolean not null default true;

comment on column public.vehicles.visible_to_staff is
  'When false and status = acquired, only Super Admins see the vehicle.';
