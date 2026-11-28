ALTER TABLE "users" ALTER COLUMN "phone_e164" DROP NOT NULL;--> statement-breakpoint
ALTER TABLE "users" ADD CONSTRAINT "users_phone_or_email" CHECK ("users"."phone_e164" is not null or "users"."email" is not null);--> statement-breakpoint
-- Google sign-in: accounts may exist without a phone number until they add one (verified by OTP).
-- A verified phone stays required to post an errand and to become a Runner, so Runners can always
-- be reached and customers can be contacted about their errands.
create or replace function app.require_verified_phone() returns trigger language plpgsql security definer set search_path = public as $$
declare uid uuid; has_phone boolean;
begin
  -- (PL/pgSQL resolves every field reference in an expression, so branch with IF, not CASE.)
  if tg_table_name = 'errands' then uid := new.customer_id; else uid := new.user_id; end if;
  select u.phone_e164 is not null into has_phone from users u where u.id = uid;
  if not coalesce(has_phone, false) then
    raise exception 'a verified phone number is required (%)', tg_table_name using errcode = 'check_violation';
  end if;
  return new;
end $$;
--> statement-breakpoint
create trigger errands_require_phone before insert on public.errands for each row execute function app.require_verified_phone();
--> statement-breakpoint
create trigger runner_profiles_require_phone before insert on public.runner_profiles for each row execute function app.require_verified_phone();
--> statement-breakpoint
create trigger user_roles_runner_require_phone before insert on public.user_roles for each row when (new.role = 'runner') execute function app.require_verified_phone();
