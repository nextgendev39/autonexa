-- Development / reference seed only.
-- Do NOT insert fake customers, sales, payments, or financial transactions.

-- Roles
insert into public.roles (key, name, description, is_system)
values
  ('super_admin', 'Super Admin', 'Full platform access', true),
  ('accountant', 'Accountant', 'Payments, invoices, and financial views', true),
  ('sales_executive', 'Sales Executive', 'Reservations and sales', true),
  ('logistics', 'Logistics', 'Vehicle movement, acquisitions, and documents', true)
on conflict (key) do update
set
  name = excluded.name,
  description = excluded.description,
  is_system = excluded.is_system,
  updated_at = timezone('utc', now());

-- Permissions
insert into public.permissions (key, name, module, description)
values
  ('dashboard.view', 'View dashboard', 'dashboard', 'View operational dashboard'),
  ('vehicle.view', 'View vehicles', 'vehicle', 'View inventory vehicles'),
  ('vehicle.create', 'Create vehicles', 'vehicle', 'Create inventory vehicles'),
  ('vehicle.edit', 'Edit vehicles', 'vehicle', 'Edit inventory vehicles'),
  ('vehicle.delete', 'Delete vehicles', 'vehicle', 'Soft-delete inventory vehicles'),
  ('vehicle.cost.view', 'View vehicle costs', 'vehicle', 'View vehicle expense totals'),
  ('vehicle.cost.edit', 'Edit vehicle costs', 'vehicle', 'Create or edit vehicle expenses'),
  ('vehicle.price.view', 'View vehicle prices', 'vehicle', 'View selling prices'),
  ('vehicle.price.edit', 'Edit vehicle prices', 'vehicle', 'Change selling prices'),
  ('acquisition.view', 'View acquisitions', 'acquisition', 'View acquisition records'),
  ('acquisition.create', 'Create acquisitions', 'acquisition', 'Create acquisition records'),
  ('acquisition.edit', 'Edit acquisitions', 'acquisition', 'Edit acquisition records'),
  ('customer.view', 'View customers', 'customer', 'View customers'),
  ('customer.create', 'Create customers', 'customer', 'Create customers'),
  ('customer.edit', 'Edit customers', 'customer', 'Edit customers'),
  ('reservation.view', 'View reservations', 'reservation', 'View reservations'),
  ('reservation.create', 'Create reservations', 'reservation', 'Create reservations'),
  ('reservation.cancel', 'Cancel reservations', 'reservation', 'Cancel reservations'),
  ('sale.view', 'View sales', 'sale', 'View sales'),
  ('sale.create', 'Create sales', 'sale', 'Create sales'),
  ('sale.edit', 'Edit sales', 'sale', 'Edit sales'),
  ('sale.cancel', 'Cancel sales', 'sale', 'Cancel sales'),
  ('document.view', 'View documents', 'document', 'View documents'),
  ('document.create', 'Create documents', 'document', 'Upload documents'),
  ('document.edit', 'Edit documents', 'document', 'Edit document metadata'),
  ('report.view', 'View reports', 'report', 'View reports'),
  ('branch.view', 'View branches', 'branch', 'View branches'),
  ('branch.manage', 'Manage branches', 'branch', 'Create or edit branches'),
  ('user.manage', 'Manage users', 'user', 'Invite and manage users'),
  ('role.manage', 'Manage roles', 'role', 'Assign roles and permissions'),
  ('audit.view', 'View audit logs', 'audit', 'View audit logs'),
  ('notification.view', 'View notifications', 'notification', 'View notifications'),
  ('settings.view', 'View settings', 'settings', 'View settings'),
  ('settings.manage', 'Manage settings', 'settings', 'Change settings')
on conflict (key) do update
set
  name = excluded.name,
  module = excluded.module,
  description = excluded.description;

-- Modules removed in 00063 (inspections, leads, payments, invoices); earlier
-- migrations still create some of these keys. Grants cascade.
delete from public.permissions
where key like 'inspection.%'
   or key like 'lead.%'
   or key like 'payment.%'
   or key like 'invoice.%';

-- Super Admin receives every permission.
insert into public.role_permissions (role_id, permission_id)
select r.id, p.id
from public.roles r
cross join public.permissions p
where r.key = 'super_admin'
on conflict do nothing;

-- Role grants live here as well as in migrations: on a fresh database the
-- migrations run before any role rows exist, so their grants match nothing.

-- Accountant
insert into public.role_permissions (role_id, permission_id)
select r.id, p.id
from public.roles r
join public.permissions p on p.key in (
  'dashboard.view',
  'vehicle.view', 'vehicle.create', 'vehicle.cost.view', 'vehicle.price.view', 'vehicle.profit.view',
  'acquisition.view', 'acquisition.cost.view', 'acquisition.expense.view',
  'customer.view',
  'reservation.view',
  'sale.view',
  'document.view', 'document.create',
  'report.view', 'report.financial.view',
  'branch.view',
  'notification.view',
  'settings.view'
)
where r.key = 'accountant'
on conflict do nothing;

-- Sales Executive
insert into public.role_permissions (role_id, permission_id)
select r.id, p.id
from public.roles r
join public.permissions p on p.key in (
  'dashboard.view',
  'vehicle.view', 'vehicle.price.view',
  'pricing.view',
  'customer.view', 'customer.create', 'customer.edit',
  'reservation.view', 'reservation.create', 'reservation.cancel',
  'sale.view', 'sale.create', 'sale.edit',
  'document.view', 'document.create',
  'notification.view',
  'settings.view'
)
where r.key = 'sales_executive'
on conflict do nothing;

-- Logistics: no migration defines its grants; this is a minimal starting set.
insert into public.role_permissions (role_id, permission_id)
select r.id, p.id
from public.roles r
join public.permissions p on p.key in (
  'dashboard.view',
  'vehicle.view',
  'acquisition.view',
  'document.view', 'document.create',
  'branch.view',
  'notification.view',
  'settings.view'
)
where r.key = 'logistics'
on conflict do nothing;

-- Document types
insert into public.document_types (key, name, description)
values
  ('purchase_invoice', 'Purchase Invoice', 'Vehicle purchase invoice'),
  ('auction_invoice', 'Auction Invoice', 'Auction sale invoice'),
  ('seller_invoice', 'Seller Invoice', 'Seller-issued invoice'),
  ('purchase_agreement', 'Purchase Agreement', 'Acquisition purchase agreement'),
  ('payment_receipt', 'Payment Receipt', 'Payment receipt for acquisition'),
  ('transport_document', 'Transport Document', 'Transport / shipping document'),
  ('customs_document', 'Customs Document', 'Customs paperwork'),
  ('import_document', 'Import Document', 'Import paperwork'),
  ('registration_document', 'Registration Document', 'Registration / mulkiya documents'),
  ('inspection_document', 'Inspection Document', 'Inspection reports and attachments'),
  ('ownership_document', 'Ownership Document', 'Ownership / title documents'),
  ('registration', 'Registration', 'Vehicle registration documents'),
  ('customs', 'Customs', 'Customs and import paperwork'),
  ('inspection', 'Inspection', 'Inspection reports and attachments'),
  ('insurance', 'Insurance', 'Insurance documents'),
  ('export', 'Export', 'Export paperwork'),
  ('sales_invoice', 'Sales Invoice', 'Customer sales invoice'),
  ('customer_document', 'Customer Document', 'Customer identity or supporting documents'),
  ('warranty', 'Warranty', 'Warranty documents'),
  ('other', 'Other', 'Uncategorized document')
on conflict (key) do update
set
  name = excluded.name,
  description = excluded.description,
  is_active = true,
  updated_at = timezone('utc', now());

-- Optional demo branch (no financial records).
insert into public.branches (
  name,
  code,
  emirate,
  address_line_1,
  city,
  phone,
  email,
  is_active
)
select
  'AutoNexa Dubai',
  'DXB-01',
  'dubai',
  'Showroom Road',
  'Dubai',
  '+971400000000',
  'dubai@autonexa.local',
  true
where not exists (select 1 from public.branches where code = 'DXB-01');

-- Phase 5: vehicle master data (makes, models, locations).
insert into public.vehicle_makes (name, sort_order)
values
  ('Toyota', 10),
  ('Nissan', 20),
  ('Lexus', 30),
  ('Mercedes-Benz', 40),
  ('BMW', 50),
  ('Audi', 60),
  ('Ford', 70),
  ('Honda', 80),
  ('Hyundai', 90),
  ('Kia', 100),
  ('Land Rover', 110),
  ('Porsche', 120)
on conflict (name) do update set sort_order = excluded.sort_order, is_active = true;

insert into public.vehicle_models (make_id, name)
select m.id, x.model
from public.vehicle_makes m
join (
  values
    ('Toyota', 'Land Cruiser'),
    ('Toyota', 'Camry'),
    ('Toyota', 'Prado'),
    ('Nissan', 'Patrol'),
    ('Nissan', 'Altima'),
    ('Lexus', 'ES'),
    ('Lexus', 'LX'),
    ('Mercedes-Benz', 'GLC'),
    ('Mercedes-Benz', 'E-Class'),
    ('BMW', 'X5'),
    ('BMW', '5 Series'),
    ('Audi', 'Q7'),
    ('Land Rover', 'Range Rover Sport'),
    ('Porsche', 'Cayenne'),
    ('Hyundai', 'Tucson'),
    ('Kia', 'Sportage')
) as x(make, model) on x.make = m.name
on conflict (make_id, name) do nothing;

insert into public.branch_locations (branch_id, name, location_type)
select b.id, loc.name, loc.location_type::public.branch_location_type
from public.branches b
cross join (
  values
    ('Main Showroom', 'showroom'),
    ('Main Yard', 'yard'),
    ('Workshop', 'workshop'),
    ('Storage', 'storage'),
    ('Delivery Area', 'delivery')
) as loc(name, location_type)
where b.code = 'DXB-01'
  and not exists (
    select 1 from public.branch_locations bl
    where bl.branch_id = b.id and bl.name = loc.name
  );
