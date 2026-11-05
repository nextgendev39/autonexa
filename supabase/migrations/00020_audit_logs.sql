-- Append-only audit log. Prefer selective triggers over logging every column twitch.

create table public.audit_logs (
  id uuid primary key default gen_random_uuid(),
  user_id uuid references public.profiles (id) on delete set null,
  action text not null,
  entity_type text not null,
  entity_id uuid,
  old_values jsonb,
  new_values jsonb,
  metadata jsonb not null default '{}'::jsonb,
  ip_address inet,
  user_agent text,
  created_at timestamptz not null default timezone('utc', now()),
  constraint audit_logs_action_not_blank check (length(trim(action)) > 0),
  constraint audit_logs_entity_type_not_blank check (length(trim(entity_type)) > 0)
);

comment on table public.audit_logs is
  'Security/compliance audit trail. Do not store passwords or secrets in JSON payloads.';
