-- In-app notification foundation. External delivery comes later.

create table public.notifications (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references public.profiles (id) on delete cascade,
  type text not null,
  title text not null,
  message text not null,
  entity_type text,
  entity_id uuid,
  is_read boolean not null default false,
  read_at timestamptz,
  created_at timestamptz not null default timezone('utc', now()),
  constraint notifications_type_not_blank check (length(trim(type)) > 0),
  constraint notifications_title_not_blank check (length(trim(title)) > 0),
  constraint notifications_read_consistency check (
    (is_read = false and read_at is null)
    or (is_read = true and read_at is not null)
  )
);

comment on table public.notifications is
  'Per-user notification inbox. Delivery channels (email/WhatsApp) are out of scope for Phase 3.';
