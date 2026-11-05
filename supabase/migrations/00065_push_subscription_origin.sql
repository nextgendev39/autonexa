-- Web push subscriptions belong to the site (origin) the browser subscribed on.
-- Local and deployed apps can share this database, so each one must push only to
-- its own subscriptions; otherwise production pushes arrive labelled "localhost".
-- Existing rows have no origin and are skipped until the browser re-saves them,
-- which the app does on every page load while permission is granted.

alter table public.push_subscriptions
  add column if not exists origin text;

create index if not exists push_subscriptions_origin_user_id_idx
  on public.push_subscriptions (origin, user_id);
