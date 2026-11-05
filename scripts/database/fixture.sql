-- Compatibility fixture for disposable PostgreSQL verification only.
-- Not a replacement for Supabase Auth, Storage, or its HTTP services.
CREATE SCHEMA auth;
CREATE SCHEMA storage;
CREATE SCHEMA extensions;
CREATE ROLE anon NOLOGIN;
CREATE ROLE authenticated NOLOGIN;
CREATE ROLE service_role NOLOGIN BYPASSRLS;
CREATE TABLE auth.users (
  id uuid PRIMARY KEY,
  email text,
  email_confirmed_at timestamptz,
  deleted_at timestamptz,
  raw_user_meta_data jsonb DEFAULT '{}'::jsonb
);
CREATE FUNCTION auth.uid() RETURNS uuid LANGUAGE sql STABLE AS $$
  SELECT nullif(current_setting('request.jwt.claim.sub', true), '')::uuid;
$$;
CREATE FUNCTION auth.jwt() RETURNS jsonb LANGUAGE sql STABLE AS $$
  SELECT coalesce(nullif(current_setting('request.jwt.claims', true), ''), '{}')::jsonb;
$$;
CREATE TABLE storage.buckets (
  id text PRIMARY KEY, name text, public boolean DEFAULT false,
  file_size_limit bigint, allowed_mime_types text[]
);
CREATE TABLE storage.objects (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  bucket_id text REFERENCES storage.buckets(id), name text, owner uuid
);
ALTER TABLE storage.objects ENABLE ROW LEVEL SECURITY;
GRANT USAGE ON SCHEMA public, auth, storage TO anon, authenticated, service_role;
GRANT SELECT ON auth.users TO authenticated;
ALTER DEFAULT PRIVILEGES IN SCHEMA public
  GRANT SELECT, INSERT, UPDATE, DELETE ON TABLES TO authenticated, service_role;
ALTER DEFAULT PRIVILEGES IN SCHEMA public
  GRANT USAGE, SELECT ON SEQUENCES TO authenticated, service_role;
