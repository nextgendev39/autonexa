-- App-managed password reset, built like the invite verification in 00046.
--
-- The app emails a 6-digit code over its own SMTP and stores only an HMAC of it.
-- A correct code yields a short-lived, single-use reset grant (again only its
-- HMAC is stored); the new password is accepted only while that grant is valid.
--
-- Server-side rules (enforced here, not in the browser):
--   * one active code per user (a new request replaces the old one),
--   * 5-minute code expiry, 60-second resend cooldown,
--   * 5 incorrect attempts per code, then the code is locked,
--   * the reset grant expires (10 minutes) and can be redeemed once.

create table public.password_reset_otps (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null unique references auth.users (id) on delete cascade,
  email text not null,
  otp_hash text not null,
  expires_at timestamptz not null,
  last_sent_at timestamptz not null,
  verified_at timestamptz,
  attempt_count integer not null default 0,
  max_attempts integer not null default 5,
  send_count integer not null default 1,
  grant_hash text,
  grant_expires_at timestamptz,
  grant_used_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint password_reset_otps_attempts_valid
    check (attempt_count >= 0 and max_attempts > 0)
);

create index password_reset_otps_email_idx on public.password_reset_otps (email);
create index password_reset_otps_grant_hash_idx on public.password_reset_otps (grant_hash);

comment on table public.password_reset_otps is
  'One row per user: HMAC of the current password reset code and of the reset grant issued after it is verified. Never raw values. Service role only.';

alter table public.password_reset_otps enable row level security;
revoke all on public.password_reset_otps from anon, authenticated;

-- Atomically issue (or replace) the user's code. Unlike invites, a used or
-- verified code is replaced too, so a person can reset again later. Returns
-- issued = false, with the current timings, inside the cooldown window.
create or replace function public.issue_password_reset_otp(
  p_user_id uuid,
  p_email text,
  p_otp_hash text,
  p_cooldown_seconds integer default 60,
  p_ttl_seconds integer default 300
)
returns table (
  otp_id uuid,
  last_sent_at timestamptz,
  expires_at timestamptz,
  send_count integer,
  issued boolean
)
language plpgsql
security definer
set search_path = public
as $$
#variable_conflict use_column
declare
  v_now timestamptz := now();
begin
  return query
  insert into public.password_reset_otps as o (
    user_id, email, otp_hash, expires_at, last_sent_at, verified_at, attempt_count, send_count
  )
  values (
    p_user_id, lower(trim(p_email)), p_otp_hash,
    v_now + make_interval(secs => p_ttl_seconds), v_now, null, 0, 1
  )
  on conflict (user_id) do update set
    email = excluded.email,
    otp_hash = excluded.otp_hash,
    expires_at = excluded.expires_at,
    last_sent_at = excluded.last_sent_at,
    verified_at = null,
    attempt_count = 0,
    send_count = o.send_count + 1,
    grant_hash = null,
    grant_expires_at = null,
    grant_used_at = null,
    updated_at = v_now
  where o.last_sent_at <= v_now - make_interval(secs => p_cooldown_seconds)
  returning o.id, o.last_sent_at, o.expires_at, o.send_count, true;

  if not found then
    return query
    select o.id, o.last_sent_at, o.expires_at, o.send_count, false
    from public.password_reset_otps o
    where o.user_id = p_user_id;
  end if;
end;
$$;

-- Same contract as record_email_verification_attempt. On a correct code it also
-- stores the HMAC of the reset grant the app hands to the browser.
--   outcome: verified | invalid | locked | expired | already_verified | stale | not_found
create or replace function public.record_password_reset_attempt(
  p_otp_id uuid,
  p_compared_hash text,
  p_matches boolean,
  p_grant_hash text,
  p_grant_ttl_seconds integer default 600
)
returns table (
  outcome text,
  user_id uuid,
  attempts_remaining integer
)
language plpgsql
security definer
set search_path = public
as $$
#variable_conflict use_column
declare
  v_row public.password_reset_otps%rowtype;
begin
  select * into v_row from public.password_reset_otps o where o.id = p_otp_id for update;

  if not found then
    return query select 'not_found'::text, null::uuid, 0;
    return;
  end if;
  if v_row.verified_at is not null then
    return query select 'already_verified'::text, v_row.user_id, 0;
    return;
  end if;
  if v_row.otp_hash <> p_compared_hash then
    return query select 'stale'::text, v_row.user_id, v_row.max_attempts - v_row.attempt_count;
    return;
  end if;
  if v_row.expires_at <= now() then
    return query select 'expired'::text, v_row.user_id, 0;
    return;
  end if;
  if v_row.attempt_count >= v_row.max_attempts then
    return query select 'locked'::text, v_row.user_id, 0;
    return;
  end if;

  if p_matches then
    update public.password_reset_otps o
    set verified_at = now(),
        grant_hash = p_grant_hash,
        grant_expires_at = now() + make_interval(secs => p_grant_ttl_seconds),
        grant_used_at = null,
        updated_at = now()
    where o.id = p_otp_id;
    return query select 'verified'::text, v_row.user_id, v_row.max_attempts - v_row.attempt_count;
    return;
  end if;

  update public.password_reset_otps o
  set attempt_count = o.attempt_count + 1, updated_at = now()
  where o.id = p_otp_id;

  return query select
    case when v_row.attempt_count + 1 >= v_row.max_attempts then 'locked' else 'invalid' end,
    v_row.user_id,
    greatest(v_row.max_attempts - v_row.attempt_count - 1, 0);
end;
$$;

-- Redeems a reset grant exactly once: a single UPDATE, so two parallel
-- submissions can't both succeed. Returns no row when invalid, expired or used.
create or replace function public.consume_password_reset_grant(p_grant_hash text)
returns table (otp_id uuid, user_id uuid, email text)
language sql
security definer
set search_path = public
as $$
  update public.password_reset_otps o
  set grant_used_at = now(), updated_at = now()
  where o.grant_hash = p_grant_hash
    and o.grant_used_at is null
    and o.grant_expires_at > now()
  returning o.id, o.user_id, o.email;
$$;

-- Gives the grant back when the password update itself failed (e.g. rejected by
-- Supabase), so the person can pick another password without a new code.
create or replace function public.release_password_reset_grant(p_otp_id uuid)
returns void
language sql
security definer
set search_path = public
as $$
  update public.password_reset_otps
  set grant_used_at = null, updated_at = now()
  where id = p_otp_id and grant_expires_at > now();
$$;

-- Retention: drop rows whose code and grant both expired more than a day ago.
create or replace function public.cleanup_password_reset_otps()
returns integer
language plpgsql
security definer
set search_path = public
as $$
declare
  v_deleted integer;
begin
  delete from public.password_reset_otps
  where expires_at < now() - interval '1 day'
    and (grant_expires_at is null or grant_expires_at < now() - interval '1 day');
  get diagnostics v_deleted = row_count;
  return v_deleted;
end;
$$;

revoke all on function public.issue_password_reset_otp(uuid, text, text, integer, integer) from public, anon, authenticated;
revoke all on function public.record_password_reset_attempt(uuid, text, boolean, text, integer) from public, anon, authenticated;
revoke all on function public.consume_password_reset_grant(text) from public, anon, authenticated;
revoke all on function public.release_password_reset_grant(uuid) from public, anon, authenticated;
revoke all on function public.cleanup_password_reset_otps() from public, anon, authenticated;
grant execute on function public.issue_password_reset_otp(uuid, text, text, integer, integer) to service_role;
grant execute on function public.record_password_reset_attempt(uuid, text, boolean, text, integer) to service_role;
grant execute on function public.consume_password_reset_grant(text) to service_role;
grant execute on function public.release_password_reset_grant(uuid) to service_role;
grant execute on function public.cleanup_password_reset_otps() to service_role;
