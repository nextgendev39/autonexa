-- Phase 4: complete role → permission mappings + sensitive permission keys.

insert into public.permissions (key, name, module, description)
values
  ('vehicle.profit.view', 'View vehicle profit', 'vehicle', 'View acquisition cost vs selling price margin'),
  ('report.financial.view', 'View financial reports', 'report', 'View financial KPIs and profit reports')
on conflict (key) do update
set
  name = excluded.name,
  module = excluded.module,
  description = excluded.description;

-- Super Admin already gets every permission via seed cross join; refresh for new keys.
insert into public.role_permissions (role_id, permission_id)
select r.id, p.id
from public.roles r
cross join public.permissions p
where r.key = 'super_admin'
on conflict do nothing;

-- Admin: everything except payment.refund (same as seed policy).
insert into public.role_permissions (role_id, permission_id)
select r.id, p.id
from public.roles r
join public.permissions p on p.key not in ('payment.refund')
where r.key = 'admin'
on conflict do nothing;

-- General Manager: cross-branch operational visibility + reporting (no user/role manage, no refund).
insert into public.role_permissions (role_id, permission_id)
select r.id, p.id
from public.roles r
join public.permissions p on p.key in (
  'dashboard.view',
  'vehicle.view', 'vehicle.create', 'vehicle.edit',
  'vehicle.cost.view', 'vehicle.price.view', 'vehicle.price.edit', 'vehicle.profit.view',
  'acquisition.view', 'acquisition.create', 'acquisition.edit',
  'inspection.view', 'inspection.create', 'inspection.edit', 'inspection.approve',
  'workshop.view', 'workshop.create', 'workshop.edit',
  'customer.view', 'customer.create', 'customer.edit',
  'lead.view', 'lead.create', 'lead.edit',
  'reservation.view', 'reservation.create', 'reservation.cancel',
  'sale.view', 'sale.create', 'sale.edit', 'sale.cancel',
  'payment.view', 'payment.create',
  'invoice.view', 'invoice.create', 'invoice.edit',
  'document.view', 'document.create', 'document.edit',
  'report.view', 'report.financial.view',
  'branch.view',
  'audit.view',
  'notification.view',
  'settings.view'
)
where r.key = 'general_manager'
on conflict do nothing;

-- Inventory Manager
insert into public.role_permissions (role_id, permission_id)
select r.id, p.id
from public.roles r
join public.permissions p on p.key in (
  'dashboard.view',
  'vehicle.view', 'vehicle.create', 'vehicle.edit', 'vehicle.delete',
  'vehicle.cost.view', 'vehicle.cost.edit',
  'vehicle.price.view', 'vehicle.price.edit', 'vehicle.profit.view',
  'acquisition.view', 'acquisition.create', 'acquisition.edit',
  'inspection.view',
  'workshop.view',
  'document.view', 'document.create', 'document.edit',
  'report.view',
  'branch.view',
  'notification.view',
  'settings.view'
)
where r.key = 'inventory_manager'
on conflict do nothing;

-- Sales Manager
insert into public.role_permissions (role_id, permission_id)
select r.id, p.id
from public.roles r
join public.permissions p on p.key in (
  'dashboard.view',
  'vehicle.view', 'vehicle.price.view',
  'customer.view', 'customer.create', 'customer.edit',
  'lead.view', 'lead.create', 'lead.edit',
  'reservation.view', 'reservation.create', 'reservation.cancel',
  'sale.view', 'sale.create', 'sale.edit', 'sale.cancel',
  'payment.view', 'payment.create',
  'invoice.view',
  'document.view', 'document.create',
  'report.view',
  'branch.view',
  'notification.view',
  'settings.view'
)
where r.key = 'sales_manager'
on conflict do nothing;

-- Sales Executive (no internal costs/profit, no refunds, no user admin)
insert into public.role_permissions (role_id, permission_id)
select r.id, p.id
from public.roles r
join public.permissions p on p.key in (
  'dashboard.view',
  'vehicle.view', 'vehicle.price.view',
  'customer.view', 'customer.create', 'customer.edit',
  'lead.view', 'lead.create', 'lead.edit',
  'reservation.view', 'reservation.create', 'reservation.cancel',
  'sale.view', 'sale.create', 'sale.edit',
  'document.view', 'document.create',
  'notification.view',
  'settings.view'
)
where r.key = 'sales_executive'
on conflict do nothing;

-- Inspector
insert into public.role_permissions (role_id, permission_id)
select r.id, p.id
from public.roles r
join public.permissions p on p.key in (
  'dashboard.view',
  'vehicle.view',
  'inspection.view', 'inspection.create', 'inspection.edit', 'inspection.approve',
  'document.view', 'document.create',
  'notification.view',
  'settings.view'
)
where r.key = 'inspector'
on conflict do nothing;

-- Workshop Manager
insert into public.role_permissions (role_id, permission_id)
select r.id, p.id
from public.roles r
join public.permissions p on p.key in (
  'dashboard.view',
  'vehicle.view',
  'vehicle.cost.view', 'vehicle.cost.edit',
  'inspection.view',
  'workshop.view', 'workshop.create', 'workshop.edit',
  'document.view', 'document.create',
  'notification.view',
  'settings.view'
)
where r.key = 'workshop_manager'
on conflict do nothing;

-- Accountant
insert into public.role_permissions (role_id, permission_id)
select r.id, p.id
from public.roles r
join public.permissions p on p.key in (
  'dashboard.view',
  'vehicle.view', 'vehicle.cost.view', 'vehicle.price.view', 'vehicle.profit.view',
  'customer.view',
  'sale.view',
  'payment.view', 'payment.create', 'payment.refund',
  'invoice.view', 'invoice.create', 'invoice.edit',
  'document.view', 'document.create',
  'report.view', 'report.financial.view',
  'branch.view',
  'notification.view',
  'settings.view'
)
where r.key = 'accountant'
on conflict do nothing;

-- Document Officer
insert into public.role_permissions (role_id, permission_id)
select r.id, p.id
from public.roles r
join public.permissions p on p.key in (
  'dashboard.view',
  'vehicle.view',
  'customer.view',
  'sale.view',
  'document.view', 'document.create', 'document.edit',
  'notification.view',
  'settings.view'
)
where r.key = 'document_officer'
on conflict do nothing;

-- Viewer: keep read-only; add new read keys where sensible.
insert into public.role_permissions (role_id, permission_id)
select r.id, p.id
from public.roles r
join public.permissions p on p.key in (
  'dashboard.view',
  'vehicle.view',
  'vehicle.price.view',
  'acquisition.view',
  'inspection.view',
  'workshop.view',
  'customer.view',
  'lead.view',
  'reservation.view',
  'sale.view',
  'payment.view',
  'invoice.view',
  'document.view',
  'report.view',
  'branch.view',
  'notification.view',
  'settings.view'
)
where r.key = 'viewer'
on conflict do nothing;
