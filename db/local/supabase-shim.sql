-- LOCAL DEVELOPMENT / TEST ONLY — never run against Supabase.
-- Recreates the small part of Supabase that our schema and RLS policies rely on:
-- the anon/authenticated/service_role roles, auth.users, and auth.uid()/auth.jwt().
-- Also holds the local-auth OTP table used by AUTH_MODE=local (sandbox sign-in).

do $$ begin create role anon nologin noinherit; exception when duplicate_object then null; end $$;
do $$ begin create role authenticated nologin noinherit; exception when duplicate_object then null; end $$;
do $$ begin create role service_role nologin noinherit bypassrls; exception when duplicate_object then null; end $$;
grant anon, authenticated, service_role to current_user;

create schema if not exists auth;
grant usage on schema auth to anon, authenticated, service_role;

create table if not exists auth.users (
  id uuid primary key,
  phone text unique,
  created_at timestamptz not null default now(),
  last_sign_in_at timestamptz
);

-- Same semantics as Supabase: read the verified JWT claims the server sets per transaction.
create or replace function auth.jwt() returns jsonb language sql stable as $$
  select coalesce(nullif(current_setting('request.jwt.claims', true), ''), '{}')::jsonb
$$;
create or replace function auth.uid() returns uuid language sql stable as $$
  select nullif(coalesce(current_setting('request.jwt.claim.sub', true), auth.jwt() ->> 'sub'), '')::uuid
$$;
create or replace function auth.role() returns text language sql stable as $$
  select coalesce(nullif(current_setting('request.jwt.claim.role', true), ''), auth.jwt() ->> 'role')
$$;
grant execute on function auth.jwt(), auth.uid(), auth.role() to anon, authenticated, service_role;

create table if not exists auth.local_otp_challenges (
  id uuid primary key,
  phone text not null,
  code_hash text not null,
  attempts int not null default 0,
  expires_at timestamptz not null,
  consumed_at timestamptz,
  created_at timestamptz not null default now()
);
create index if not exists local_otp_challenges_phone on auth.local_otp_challenges (phone, created_at desc);
