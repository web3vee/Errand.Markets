-- Security layer: auth FK, RLS helper functions, explicit privileges, row-level security
-- policies and integrity triggers. Works on Supabase and on the local shim (db/local).
-- Server code runs user requests as role `authenticated` with the user's JWT claims
-- (see db/client.ts asUser), so these policies apply to server code too.

alter table public.users
  add constraint users_auth_user_fk foreign key (id) references auth.users (id) on delete cascade;
--> statement-breakpoint

create schema if not exists app;
--> statement-breakpoint
grant usage on schema app to anon, authenticated;
--> statement-breakpoint

create or replace function app.current_user_market() returns uuid
language sql stable security definer set search_path = public as $$
  select market_id from public.users where id = auth.uid()
$$;
--> statement-breakpoint
create or replace function app.has_role(r public.app_role) returns boolean
language sql stable security definer set search_path = public as $$
  select exists (select 1 from public.user_roles where user_id = auth.uid() and role = r and status = 'active')
$$;
--> statement-breakpoint
-- Admin of market m with permission perm (or 'super'); a grant with market_id NULL covers all markets.
create or replace function app.is_admin_for(m uuid, perm text) returns boolean
language sql stable security definer set search_path = public as $$
  select exists (
    select 1 from public.admin_grants g
    join public.user_roles r on r.user_id = g.user_id and r.role = 'admin' and r.status = 'active'
    where g.user_id = auth.uid() and g.revoked_at is null
      and (g.market_id is null or g.market_id = m)
      and (perm = any (g.permissions) or 'super' = any (g.permissions))
  )
$$;
--> statement-breakpoint
grant execute on function app.current_user_market(), app.has_role(public.app_role), app.is_admin_for(uuid, text) to anon, authenticated;
--> statement-breakpoint

-- ── Privileges: start from nothing, grant exactly what clients may do ────────────
-- (Supabase already grants schema usage; stated explicitly so local/other Postgres behave the same.)
grant usage on schema public to anon, authenticated;
--> statement-breakpoint
revoke all on all tables in schema public from anon, authenticated;
--> statement-breakpoint
grant select on public.markets, public.runner_rules, public.service_areas, public.errand_categories to anon, authenticated;
--> statement-breakpoint
grant select on public.users to authenticated;
--> statement-breakpoint
grant update (display_name, email, locale, updated_at) on public.users to authenticated;
--> statement-breakpoint
grant select on public.user_roles, public.admin_grants, public.customer_profiles, public.kyc_verifications, public.admin_audit_log to authenticated;
--> statement-breakpoint
grant select on public.runner_profiles to authenticated;
--> statement-breakpoint
grant update (availability, vehicle, bio, emergency_contact_name, emergency_contact_phone, updated_at) on public.runner_profiles to authenticated;
--> statement-breakpoint
grant select, insert, delete on public.runner_service_areas to authenticated;
--> statement-breakpoint

-- ── Row-level security (default deny on every table) ─────────────────────────────
alter table public.markets enable row level security;
--> statement-breakpoint
alter table public.runner_rules enable row level security;
--> statement-breakpoint
alter table public.service_areas enable row level security;
--> statement-breakpoint
alter table public.errand_categories enable row level security;
--> statement-breakpoint
alter table public.users enable row level security;
--> statement-breakpoint
alter table public.user_roles enable row level security;
--> statement-breakpoint
alter table public.admin_grants enable row level security;
--> statement-breakpoint
alter table public.customer_profiles enable row level security;
--> statement-breakpoint
alter table public.runner_profiles enable row level security;
--> statement-breakpoint
alter table public.runner_service_areas enable row level security;
--> statement-breakpoint
alter table public.kyc_verifications enable row level security;
--> statement-breakpoint
alter table public.provider_webhook_events enable row level security;
--> statement-breakpoint
alter table public.rate_limits enable row level security;
--> statement-breakpoint
alter table public.sandbox_outbox enable row level security;
--> statement-breakpoint
alter table public.admin_audit_log enable row level security;
--> statement-breakpoint

create policy markets_read on public.markets for select to anon, authenticated
  using (status = 'active' or app.is_admin_for(id, 'config'));
--> statement-breakpoint
create policy runner_rules_read on public.runner_rules for select to anon, authenticated using (true);
--> statement-breakpoint
create policy service_areas_read on public.service_areas for select to anon, authenticated using (active or app.is_admin_for(market_id, 'config'));
--> statement-breakpoint
create policy errand_categories_read on public.errand_categories for select to anon, authenticated using (active or app.is_admin_for(market_id, 'config'));
--> statement-breakpoint

create policy users_read_own on public.users for select to authenticated using (id = auth.uid());
--> statement-breakpoint
create policy users_read_admin on public.users for select to authenticated using (app.is_admin_for(market_id, 'ops') or app.is_admin_for(market_id, 'support'));
--> statement-breakpoint
create policy users_update_own on public.users for update to authenticated using (id = auth.uid()) with check (id = auth.uid());
--> statement-breakpoint

create policy user_roles_read_own on public.user_roles for select to authenticated using (user_id = auth.uid());
--> statement-breakpoint
create policy user_roles_read_admin on public.user_roles for select to authenticated
  using (exists (select 1 from public.users u where u.id = user_id and app.is_admin_for(u.market_id, 'ops')));
--> statement-breakpoint
create policy admin_grants_read_own on public.admin_grants for select to authenticated using (user_id = auth.uid());
--> statement-breakpoint
create policy customer_profiles_read_own on public.customer_profiles for select to authenticated using (user_id = auth.uid());
--> statement-breakpoint

create policy runner_profiles_read_own on public.runner_profiles for select to authenticated using (user_id = auth.uid());
--> statement-breakpoint
create policy runner_profiles_read_admin on public.runner_profiles for select to authenticated using (app.is_admin_for(market_id, 'ops'));
--> statement-breakpoint
create policy runner_profiles_update_own on public.runner_profiles for update to authenticated using (user_id = auth.uid()) with check (user_id = auth.uid());
--> statement-breakpoint

create policy runner_areas_read on public.runner_service_areas for select to authenticated
  using (user_id = auth.uid() or exists (select 1 from public.runner_profiles p where p.user_id = runner_service_areas.user_id and app.is_admin_for(p.market_id, 'ops')));
--> statement-breakpoint
create policy runner_areas_insert_own on public.runner_service_areas for insert to authenticated with check (user_id = auth.uid());
--> statement-breakpoint
create policy runner_areas_delete_own on public.runner_service_areas for delete to authenticated using (user_id = auth.uid());
--> statement-breakpoint

create policy kyc_read_own on public.kyc_verifications for select to authenticated using (user_id = auth.uid());
--> statement-breakpoint
create policy kyc_read_admin on public.kyc_verifications for select to authenticated using (app.is_admin_for(market_id, 'ops'));
--> statement-breakpoint
create policy audit_read_admin on public.admin_audit_log for select to authenticated using (app.is_admin_for(market_id, 'ops'));
--> statement-breakpoint
-- provider_webhook_events, rate_limits, sandbox_outbox: no policies → no client access at all.

-- ── Integrity triggers ───────────────────────────────────────────────────────────
create or replace function app.touch_updated_at() returns trigger language plpgsql as $$
begin new.updated_at = now(); return new; end $$;
--> statement-breakpoint
create trigger users_touch before update on public.users for each row execute function app.touch_updated_at();
--> statement-breakpoint
create trigger runner_profiles_touch before update on public.runner_profiles for each row execute function app.touch_updated_at();
--> statement-breakpoint
create trigger kyc_touch before update on public.kyc_verifications for each row execute function app.touch_updated_at();
--> statement-breakpoint
create trigger markets_touch before update on public.markets for each row execute function app.touch_updated_at();
--> statement-breakpoint

-- A Runner's profile, service areas and KYC records must belong to the user's own market.
create or replace function app.enforce_same_market() returns trigger language plpgsql security definer set search_path = public as $$
declare user_market uuid; area_market uuid;
begin
  if tg_table_name = 'runner_service_areas' then
    select p.market_id into user_market from runner_profiles p where p.user_id = new.user_id;
    select a.market_id into area_market from service_areas a where a.id = new.service_area_id;
    if user_market is distinct from area_market then
      raise exception 'service area belongs to a different market' using errcode = 'check_violation';
    end if;
  else
    select u.market_id into user_market from users u where u.id = new.user_id;
    if user_market is distinct from new.market_id then
      raise exception '% market must equal the user''s market', tg_table_name using errcode = 'check_violation';
    end if;
  end if;
  return new;
end $$;
--> statement-breakpoint
create trigger runner_profiles_same_market before insert or update of market_id on public.runner_profiles for each row execute function app.enforce_same_market();
--> statement-breakpoint
create trigger kyc_same_market before insert or update of market_id on public.kyc_verifications for each row execute function app.enforce_same_market();
--> statement-breakpoint
create trigger runner_areas_same_market before insert on public.runner_service_areas for each row execute function app.enforce_same_market();
--> statement-breakpoint

-- Audit log is append-only, for every role including the table owner.
create or replace function app.forbid_change() returns trigger language plpgsql as $$
begin raise exception '% is append-only', tg_table_name using errcode = 'insufficient_privilege'; end $$;
--> statement-breakpoint
create trigger admin_audit_append_only before update or delete on public.admin_audit_log for each row execute function app.forbid_change();
