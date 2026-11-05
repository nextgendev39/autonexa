-- Zohaan Motors is now a tenant and keeps its own identity. An earlier form of this version
-- moved its records to an AN- prefix and renamed its branch, and that reached the live database
-- outside the migration history. This puts them back; digits are unchanged, so numbers stay
-- unique. On a database that never had the rename, it changes nothing.
-- Audit history stays as written. New numbers come from next_tenant_number() (00073).
-- Rollback: supabase/rollbacks/00069_autonexa_record_prefix_down.sql

update public.vehicles
set stock_number = regexp_replace(stock_number, '^AN-', 'ZM-')
where stock_number like 'AN-%';

update public.acquisitions
set acquisition_number = regexp_replace(acquisition_number, '^AN-', 'ZM-')
where acquisition_number like 'AN-%';

-- Notifications build their vehicle links from the stored stock number.
update public.notifications
set
  message = regexp_replace(message, '\mAN-', 'ZM-', 'g'),
  data = regexp_replace(data::text, '"AN-', '"ZM-', 'g')::jsonb
where message ~ '\mAN-' or data::text like '%"AN-%';

-- Only the name the rename set: a branch renamed by staff is left alone.
update public.branches
set name = 'Zohaan Motors Dubai'
where code = 'DXB-01' and name = 'AutoNexa Dubai';
