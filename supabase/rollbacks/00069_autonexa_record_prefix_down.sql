-- Rollback of 00069. Run manually, only with approval, and only with no other dealership present.
-- Restores the AN- prefix and branch name. Run after the rollbacks of 00070-00073.
update public.vehicles
set stock_number = regexp_replace(stock_number, '^ZM-', 'AN-')
where stock_number like 'ZM-%';

update public.acquisitions
set acquisition_number = regexp_replace(acquisition_number, '^ZM-', 'AN-')
where acquisition_number like 'ZM-%';

update public.notifications
set
  message = regexp_replace(message, '\mZM-', 'AN-', 'g'),
  data = regexp_replace(data::text, '"ZM-', '"AN-', 'g')::jsonb
where message ~ '\mZM-' or data::text like '%"ZM-%';

update public.branches
set name = 'AutoNexa Dubai'
where code = 'DXB-01' and name = 'Zohaan Motors Dubai';
