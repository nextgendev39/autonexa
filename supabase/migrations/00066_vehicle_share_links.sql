-- Public links a salesperson sends a customer so they can view one car without logging in.
-- Each salesperson gets one link per car (reused when they share again), so the public
-- page can show who to contact. The token is the only thing the public page trusts.
-- A link stops showing the car once it is sold, archived or deleted, or when revoked.

create table if not exists public.vehicle_share_links (
  id uuid primary key default gen_random_uuid(),
  token text not null,
  vehicle_id uuid not null references public.vehicles (id) on delete cascade,
  created_by uuid not null references public.profiles (id) on delete cascade,
  view_count integer not null default 0,
  last_viewed_at timestamptz,
  revoked_at timestamptz,
  created_at timestamptz not null default timezone('utc', now()),
  constraint vehicle_share_links_token_unique unique (token)
);

create index if not exists vehicle_share_links_vehicle_id_created_by_idx
  on public.vehicle_share_links (vehicle_id, created_by);

alter table public.vehicle_share_links enable row level security;

comment on table public.vehicle_share_links is
  'Public share links for single vehicles. No client policies: read and written by the app with the service role.';
