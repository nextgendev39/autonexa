-- Vehicle photos enhancement smoke checks (run after 00036).

begin;

select 1 / count(*)
from pg_indexes
where schemaname = 'public'
  and indexname = 'vehicle_photos_vehicle_id_category_idx';

select 1 / count(*)
from pg_proc
where proname = 'set_vehicle_photo_primary';

rollback;
