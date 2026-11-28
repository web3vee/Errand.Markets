-- Stage 5 security: privileges, RLS, blind ratings and integrity rules for disputes and ratings.
-- All writes go through server use cases; clients only read.

-- ── Privileges + RLS ─────────────────────────────────────────────────────────────
revoke all on public.disputes, public.ratings from anon, authenticated;
--> statement-breakpoint
grant select on public.disputes, public.ratings to authenticated;
--> statement-breakpoint
alter table public.disputes enable row level security;
--> statement-breakpoint
alter table public.ratings enable row level security;
--> statement-breakpoint
-- Participants of the errand and ops/support admins of its market (app.can_see_errand).
create policy disputes_read on public.disputes for select to authenticated using (app.can_see_errand(errand_id));
--> statement-breakpoint

-- ── Blind ratings ────────────────────────────────────────────────────────────────
-- Q11 (default accepted): two-way, blind until both sides have rated or the 7-day window has closed.
-- Mirrors RATING_WINDOW_DAYS in src/modules/errands/domain/fulfilment.ts.
create or replace function app.rating_window_open(confirmed timestamptz) returns boolean
language sql stable as $$ select confirmed is not null and now() < confirmed + interval '7 days' $$;
--> statement-breakpoint
create or replace function app.rating_revealed(r uuid) returns boolean
language sql stable security definer set search_path = public as $$
  select exists (
    select 1 from ratings x join errands e on e.id = x.errand_id
    where x.id = r and (
      exists (select 1 from ratings y where y.errand_id = x.errand_id and y.rater_id = x.ratee_id)
      or not app.rating_window_open(e.confirmed_at)
    )
  )
$$;
--> statement-breakpoint
grant execute on function app.rating_window_open(timestamptz), app.rating_revealed(uuid) to authenticated;
--> statement-breakpoint
create policy ratings_read on public.ratings for select to authenticated using (
  rater_id = auth.uid()
  or (ratee_id = auth.uid() and app.rating_revealed(id))
  or app.is_admin_for(market_id, 'support')
);
--> statement-breakpoint

-- ── Integrity ────────────────────────────────────────────────────────────────────
alter table public.ratings add constraint ratings_stars_range check (stars between 1 and 5);
--> statement-breakpoint
alter table public.ratings add constraint ratings_comment_length check (comment is null or char_length(comment) <= 500);
--> statement-breakpoint
alter table public.disputes add constraint disputes_resolution_consistent check (
  (status = 'open' and outcome is null and resolved_by is null and resolved_at is null)
  or (status = 'resolved' and outcome is not null and resolved_by is not null and resolved_at is not null)
);
--> statement-breakpoint
alter table public.disputes add constraint disputes_details_length check (details is null or char_length(details) <= 1000);
--> statement-breakpoint
alter table public.errands add constraint errands_item_actual_nonnegative check (item_actual_minor is null or item_actual_minor >= 0);
--> statement-breakpoint

create or replace function app.enforce_rating_rules() returns trigger language plpgsql security definer set search_path = public as $$
declare e record;
begin
  select market_id, customer_id, runner_id, status, confirmed_at into e from errands where id = new.errand_id;
  if e.status not in ('confirmed', 'paid_out') then
    raise exception 'ratings only after the errand is confirmed' using errcode = 'check_violation';
  end if;
  if not app.rating_window_open(e.confirmed_at) then
    raise exception 'the rating window has closed' using errcode = 'check_violation';
  end if;
  if new.market_id is distinct from e.market_id then
    raise exception 'rating must be in the errand''s market' using errcode = 'check_violation';
  end if;
  if not ((new.rater_role = 'customer' and new.rater_id = e.customer_id and new.ratee_id = e.runner_id)
       or (new.rater_role = 'runner' and new.rater_id = e.runner_id and new.ratee_id = e.customer_id)) then
    raise exception 'only the customer and the Runner can rate each other' using errcode = 'check_violation';
  end if;
  return new;
end $$;
--> statement-breakpoint
create trigger ratings_rules before insert on public.ratings for each row execute function app.enforce_rating_rules();
--> statement-breakpoint
create trigger ratings_append_only before update or delete on public.ratings for each row execute function app.forbid_change();
--> statement-breakpoint

create or replace function app.enforce_dispute_rules() returns trigger language plpgsql security definer set search_path = public as $$
declare e record;
begin
  if tg_op = 'DELETE' then
    raise exception 'disputes are kept for the record' using errcode = 'insufficient_privilege';
  end if;
  if tg_op = 'UPDATE' and (new.errand_id, new.raised_by, new.raised_role, new.from_status, new.reason_code, new.created_at)
       is distinct from (old.errand_id, old.raised_by, old.raised_role, old.from_status, old.reason_code, old.created_at) then
    raise exception 'only the resolution of a dispute can change' using errcode = 'check_violation';
  end if;
  if tg_op = 'UPDATE' and old.status = 'resolved' then
    raise exception 'a resolved dispute is final' using errcode = 'check_violation';
  end if;
  select market_id, customer_id, runner_id into e from errands where id = new.errand_id;
  if new.market_id is distinct from e.market_id then
    raise exception 'dispute must be in the errand''s market' using errcode = 'check_violation';
  end if;
  if not ((new.raised_role = 'customer' and new.raised_by = e.customer_id)
       or (new.raised_role = 'runner' and new.raised_by = e.runner_id)) then
    raise exception 'only the customer or the assigned Runner can raise a dispute' using errcode = 'check_violation';
  end if;
  return new;
end $$;
--> statement-breakpoint
create trigger disputes_rules before insert or update or delete on public.disputes for each row execute function app.enforce_dispute_rules();
