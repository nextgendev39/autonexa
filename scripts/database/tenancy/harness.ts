import { readdirSync, readFileSync } from "node:fs";
import { join } from "node:path";
import { PGlite } from "@electric-sql/pglite";
import { pg_trgm } from "@electric-sql/pglite/contrib/pg_trgm";

/**
 * Disposable in-process Postgres for tenant isolation tests. It never connects to a real
 * database. Supabase Auth and Storage are replaced by minimal stand-ins, and pgcrypto by
 * stubs, so this proves SQL behaviour only; rerun against local Supabase before release.
 */
const MIGRATIONS_DIR = join(process.cwd(), "supabase/migrations");

const SUPABASE_STANDINS = String.raw`
create role anon nologin;
create role authenticated nologin;
create role service_role nologin bypassrls;
create schema extensions;
create schema auth;
create schema storage;
create extension pg_trgm with schema extensions;
create function extensions.digest(text, text) returns bytea language sql as $$ select '\x00'::bytea $$;
create function extensions.gen_random_bytes(int) returns bytea language sql as $$ select '\x00'::bytea $$;
create function extensions.gen_salt(text) returns text language sql as $$ select 'x'::text $$;
create function extensions.crypt(text, text) returns text language sql as $$ select 'x'::text $$;
create function extensions.hmac(text, text, text) returns bytea language sql as $$ select '\x00'::bytea $$;
create table auth.users (
  id uuid primary key default gen_random_uuid(), email text, encrypted_password text,
  email_confirmed_at timestamptz, raw_user_meta_data jsonb, raw_app_meta_data jsonb,
  created_at timestamptz default now(), updated_at timestamptz default now(),
  last_sign_in_at timestamptz, banned_until timestamptz, deleted_at timestamptz
);
create function auth.uid() returns uuid language sql stable as
  $$ select nullif(current_setting('request.jwt.claim.sub', true), '')::uuid $$;
create function auth.role() returns text language sql stable as
  $$ select current_setting('request.jwt.claim.role', true) $$;
create function auth.jwt() returns jsonb language sql stable as
  $$ select coalesce(nullif(current_setting('request.jwt.claims', true), ''), '{}')::jsonb $$;
create table storage.buckets (
  id text primary key, name text, public boolean default false, file_size_limit bigint,
  allowed_mime_types text[], created_at timestamptz default now(),
  updated_at timestamptz default now(), owner uuid
);
create table storage.objects (
  id uuid primary key default gen_random_uuid(), bucket_id text references storage.buckets (id),
  name text, owner uuid, owner_id text, created_at timestamptz default now(),
  updated_at timestamptz default now(), last_accessed_at timestamptz, metadata jsonb,
  path_tokens text[], version text
);
alter table storage.objects enable row level security;
create function storage.foldername(name text) returns text[] language sql immutable as
  $$ select (string_to_array(name, '/'))[1:array_length(string_to_array(name, '/'), 1) - 1] $$;
create function storage.filename(name text) returns text language sql immutable as
  $$ select (string_to_array(name, '/'))[array_length(string_to_array(name, '/'), 1)] $$;
grant usage on schema auth, storage, extensions, public to anon, authenticated, service_role;
grant all on storage.objects, storage.buckets to authenticated, service_role;
-- Supabase grants these by default; migrations then revoke what they restrict.
alter default privileges in schema public grant all on tables to anon, authenticated, service_role;
alter default privileges in schema public grant all on sequences to anon, authenticated, service_role;
alter default privileges in schema public grant all on functions to anon, authenticated, service_role;
`;

function migrationFiles() {
  return readdirSync(MIGRATIONS_DIR)
    .filter((f) => f.endsWith(".sql"))
    .sort();
}

function migrationSql(file: string) {
  return readFileSync(join(MIGRATIONS_DIR, file), "utf8").replace(
    /create extension if not exists "?(pgcrypto|pg_trgm)"?[^;]*;/gi,
    "",
  );
}

export const LAST_SINGLE_TENANT_MIGRATION = "00069";

export async function applyMigrations(db: PGlite, from: string | null, through: string | null) {
  await db.exec("set search_path = public, extensions");
  for (const file of migrationFiles()) {
    const version = file.slice(0, 5);
    if (from && version < from) continue;
    if (through && version > through) continue;
    try {
      await db.exec(migrationSql(file));
    } catch (error) {
      throw new Error(`Migration ${file} failed: ${(error as Error).message}`);
    }
  }
  await db.exec("set search_path = public, extensions");
}

export async function createDatabase(through: string | null = null) {
  const db = new PGlite({ extensions: { pg_trgm } });
  await db.exec(SUPABASE_STANDINS);
  await applyMigrations(db, null, through);
  return db;
}

export async function rows<T = Record<string, unknown>>(
  db: PGlite,
  sql: string,
  params: unknown[] = [],
): Promise<T[]> {
  return (await db.query<T>(sql, params)).rows;
}

/** True when `sql` names something the current schema has. */
export async function exists(db: PGlite, regclassOrProc: string) {
  const [row] = await rows<{ found: boolean }>(
    db,
    `select to_regclass($1) is not null or to_regproc($1) is not null as found`,
    [regclassOrProc],
  );
  return row.found;
}

/**
 * Runs `work` as a logged-in user inside a transaction that always rolls back, the same
 * way `withAuthenticatedTransaction` establishes identity in the app.
 */
export async function asUser<T>(
  db: PGlite,
  userId: string | null,
  work: () => Promise<T>,
  extraClaims: Record<string, unknown> = {},
): Promise<T> {
  const claims = JSON.stringify({ sub: userId, role: "authenticated", ...extraClaims });
  await db.exec("begin");
  try {
    await db.query(
      `select set_config('request.jwt.claims', $1, true), set_config('request.jwt.claim.sub', $2, true)`,
      [claims, userId ?? ""],
    );
    await db.exec("set local role authenticated");
    return await work();
  } finally {
    await db.exec("rollback");
  }
}

/**
 * Outcome of an attempt that a tenant boundary should stop. A savepoint keeps the
 * surrounding transaction usable after an error, so one test can check state afterwards.
 */
export async function attempt<T>(db: PGlite, work: () => Promise<T>) {
  await db.exec("savepoint attempt");
  try {
    const value = await work();
    await db.exec("release savepoint attempt");
    return { ok: true as const, value };
  } catch (error) {
    await db.exec("rollback to savepoint attempt");
    return { ok: false as const, error: (error as Error).message };
  }
}

/** Runs `work` with RLS off, inside the current transaction, then restores the user role. */
export async function asSuperuser<T>(db: PGlite, work: () => Promise<T>) {
  await db.exec("reset role");
  try {
    return await work();
  } finally {
    await db.exec("set local role authenticated");
  }
}
