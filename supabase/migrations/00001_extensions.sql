-- Phase 3: required PostgreSQL extensions for AutoNexa.

create extension if not exists "pgcrypto" with schema extensions;
create extension if not exists "pg_trgm" with schema extensions;
