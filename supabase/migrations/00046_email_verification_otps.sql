-- App-managed email verification OTPs.
--
-- The app generates a 6-digit code, stores only an HMAC-SHA256 of it here, and
-- emails it over its own SMTP. Supabase Auth still owns users, passwords and
-- sessions; on a correct code the app marks auth.users.email_confirmed_at via the
-- Admin API. Supabase's own confirmation email/link is never used.
--
-- Server-side rules (enforced here, not in the browser):
--   * one active code per user (new code replaces the old hash),
--   * 5-minute expiry,
--   * 60-second resend cooldown,
--   * 5 incorrect attempts per code, then the code is locked.

-- Replaces the bookkeeping table from 00045.
drop function if exists public.issue_email_verification(uuid, text, integer, integer);
drop function if exists public.consume_email_verification_attempt(uuid, integer);
drop table if exists public.email_verification_challenges;

create table public.email_verification_otps (
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
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint email_verification_otps_attempts_valid
    check (attempt_count >= 0 and max_attempts > 0)
);

create index email_verification_otps_email_idx on public.email_verification_otps (email);

comment on table public.email_verification_otps is
  'One row per user: HMAC of the current verification code plus timing/attempts. Never the raw code. Service role only.';

-- Service role only: no policies, so anon/authenticated get nothing.
alter table public.email_verification_otps enable row level security;
revoke all on public.email_verification_otps from anon, authenticated;

-- Atomically issue (or replace) the user's code. Returns issued = false, with the
-- current timings, while the previous code is younger than p_cooldown_seconds; the
-- caller must then not send the new code, so the previous one stays the only valid one.
create or replace function public.issue_email_verification_otp(
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
  insert into public.email_verification_otps as o (
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
    attempt_count = 0,
    send_count = o.send_count + 1,
    updated_at = v_now
  where o.verified_at is null
    and o.last_sent_at <= v_now - make_interval(secs => p_cooldown_seconds)
  returning o.id, o.last_sent_at, o.expires_at, o.send_count, true;

  if not found then
    return query
    select o.id, o.last_sent_at, o.expires_at, o.send_count, false
    from public.email_verification_otps o
    where o.user_id = p_user_id;
  end if;
end;
$$;

-- Records the result of one verification attempt. The app compares the submitted
-- code with otp_hash in constant time and passes the hash it compared against;
-- under a row lock this re-checks the state, so parallel guesses can't exceed the
-- attempt limit and only one correct submission can succeed.
--   outcome: verified | invalid | locked | expired | already_verified | stale | not_found
create or replace function public.record_email_verification_attempt(
  p_otp_id uuid,
  p_compared_hash text,
  p_matches boolean
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
  v_row public.email_verification_otps%rowtype;
begin
  select * into v_row from public.email_verification_otps o where o.id = p_otp_id for update;

  if not found then
    return query select 'not_found'::text, null::uuid, 0;
    return;
  end if;
  if v_row.verified_at is not null then
    return query select 'already_verified'::text, v_row.user_id, 0;
    return;
  end if;
  -- A resend replaced the code after the caller read it: don't count or accept.
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
    update public.email_verification_otps o
    set verified_at = now(), updated_at = now()
    where o.id = p_otp_id;
    return query select 'verified'::text, v_row.user_id, v_row.max_attempts - v_row.attempt_count;
    return;
  end if;

  update public.email_verification_otps o
  set attempt_count = o.attempt_count + 1, updated_at = now()
  where o.id = p_otp_id;

  return query select
    case when v_row.attempt_count + 1 >= v_row.max_attempts then 'locked' else 'invalid' end,
    v_row.user_id,
    greatest(v_row.max_attempts - v_row.attempt_count - 1, 0);
end;
$$;

-- Lets a retry happen if marking the auth user / opening the session failed after
-- a correct code.
create or replace function public.reopen_email_verification_otp(p_otp_id uuid)
returns void
language sql
security definer
set search_path = public
as $$
  update public.email_verification_otps
  set verified_at = null, updated_at = now()
  where id = p_otp_id;
$$;

-- Read-only lookup of an auth user by email (id + confirmation state only).
create or replace function public.auth_user_for_email(p_email text)
returns table (user_id uuid, email text, email_confirmed_at timestamptz)
language sql
stable
security definer
set search_path = public, auth
as $$
  select u.id, lower(u.email::text), u.email_confirmed_at
  from auth.users u
  where lower(u.email) = lower(trim(p_email))
    and u.deleted_at is null
  limit 1;
$$;

-- Retention: drop rows verified more than 30 days ago and unverified rows whose
-- code expired more than 7 days ago. Active codes are never touched.
create or replace function public.cleanup_email_verification_otps()
returns integer
language plpgsql
security definer
set search_path = public
as $$
declare
  v_deleted integer;
begin
  delete from public.email_verification_otps
  where (verified_at is not null and verified_at < now() - interval '30 days')
     or (verified_at is null and expires_at < now() - interval '7 days');
  get diagnostics v_deleted = row_count;
  return v_deleted;
end;
$$;

revoke all on function public.issue_email_verification_otp(uuid, text, text, integer, integer) from public, anon, authenticated;
revoke all on function public.record_email_verification_attempt(uuid, text, boolean) from public, anon, authenticated;
revoke all on function public.reopen_email_verification_otp(uuid) from public, anon, authenticated;
revoke all on function public.auth_user_for_email(text) from public, anon, authenticated;
revoke all on function public.cleanup_email_verification_otps() from public, anon, authenticated;
grant execute on function public.issue_email_verification_otp(uuid, text, text, integer, integer) to service_role;
grant execute on function public.record_email_verification_attempt(uuid, text, boolean) to service_role;
grant execute on function public.reopen_email_verification_otp(uuid) to service_role;
grant execute on function public.auth_user_for_email(text) to service_role;
grant execute on function public.cleanup_email_verification_otps() to service_role;

-- Daily cleanup when pg_cron is enabled (Database → Extensions). Without it the
-- app also runs the cleanup opportunistically when it issues codes.
do $$
begin
  if exists (select 1 from pg_extension where extname = 'pg_cron') then
    perform cron.schedule(
      'cleanup-email-verification-otps',
      '17 3 * * *',
      'select public.cleanup_email_verification_otps()'
    );
  end if;
end;
$$;
