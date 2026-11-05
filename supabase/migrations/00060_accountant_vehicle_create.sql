-- Accountants can add cars to inventory but not edit them afterwards: they get
-- vehicle.create only (no vehicle.edit, status changes or price edits). Photo uploads
-- from the create flow are limited, in the app, to cars the accountant created.
insert into public.role_permissions (role_id, permission_id)
select r.id, p.id
from public.roles r
join public.permissions p on p.key = 'vehicle.create'
where r.key = 'accountant'
on conflict do nothing;
