-- Stage 4 security: privileges, RLS, integrity triggers, legal errand state transitions,
-- and (on Supabase only) Realtime broadcast for chat and errand status.
-- All client writes go through server use cases; clients only read (plus a few self-service updates).

-- ── Helper functions (security definer: avoid recursive RLS) ─────────────────────
create or replace function app.can_see_errand(e uuid) returns boolean
language sql stable security definer set search_path = public as $$
  select exists (
    select 1 from errands x where x.id = e
      and (x.customer_id = auth.uid() or x.runner_id = auth.uid()
           or app.is_admin_for(x.market_id, 'ops') or app.is_admin_for(x.market_id, 'support'))
  )
$$;
--> statement-breakpoint
create or replace function app.is_conversation_participant(c uuid) returns boolean
language sql stable security definer set search_path = public as $$
  select exists (
    select 1 from conversations x where x.id = c
      and (x.customer_id = auth.uid() or x.runner_id = auth.uid() or app.is_admin_for(x.market_id, 'support'))
  )
$$;
--> statement-breakpoint
-- Exact locations: owner, admins, or the assigned Runner once the errand is paid for.
create or replace function app.can_see_place(p uuid) returns boolean
language sql stable security definer set search_path = public as $$
  select exists (select 1 from places pl where pl.id = p and (pl.owner_id = auth.uid() or app.is_admin_for(pl.market_id, 'ops')))
      or exists (
        select 1 from errand_stops s join errands e on e.id = s.errand_id
        where s.place_id = p and e.runner_id = auth.uid()
          and e.status in ('funded', 'in_progress', 'completed_pending_confirmation', 'confirmed', 'paid_out', 'disputed')
      )
$$;
--> statement-breakpoint
grant execute on function app.can_see_errand(uuid), app.is_conversation_participant(uuid), app.can_see_place(uuid) to authenticated;
--> statement-breakpoint

-- ── Privileges ───────────────────────────────────────────────────────────────────
revoke all on public.market_fee_schedules, public.prohibited_items, public.places, public.errands, public.errand_stops,
  public.errand_items, public.media, public.offers, public.errand_events, public.conversations, public.messages,
  public.conversation_reads, public.notifications, public.notification_deliveries, public.push_subscriptions,
  public.blocks, public.reports from anon, authenticated;
--> statement-breakpoint
grant select on public.market_fee_schedules, public.prohibited_items to anon, authenticated;
--> statement-breakpoint
grant select on public.places, public.errands, public.errand_stops, public.errand_items, public.media, public.offers,
  public.errand_events, public.conversations, public.messages, public.conversation_reads, public.notifications,
  public.push_subscriptions, public.blocks, public.reports to authenticated;
--> statement-breakpoint
grant update (read_at) on public.notifications to authenticated;
--> statement-breakpoint
grant delete on public.push_subscriptions to authenticated;
--> statement-breakpoint

-- ── RLS ──────────────────────────────────────────────────────────────────────────
alter table public.market_fee_schedules enable row level security;
--> statement-breakpoint
alter table public.prohibited_items enable row level security;
--> statement-breakpoint
alter table public.places enable row level security;
--> statement-breakpoint
alter table public.errands enable row level security;
--> statement-breakpoint
alter table public.errand_stops enable row level security;
--> statement-breakpoint
alter table public.errand_items enable row level security;
--> statement-breakpoint
alter table public.media enable row level security;
--> statement-breakpoint
alter table public.offers enable row level security;
--> statement-breakpoint
alter table public.errand_events enable row level security;
--> statement-breakpoint
alter table public.conversations enable row level security;
--> statement-breakpoint
alter table public.messages enable row level security;
--> statement-breakpoint
alter table public.conversation_reads enable row level security;
--> statement-breakpoint
alter table public.notifications enable row level security;
--> statement-breakpoint
alter table public.notification_deliveries enable row level security;
--> statement-breakpoint
alter table public.push_subscriptions enable row level security;
--> statement-breakpoint
alter table public.blocks enable row level security;
--> statement-breakpoint
alter table public.reports enable row level security;
--> statement-breakpoint

create policy fee_schedules_read on public.market_fee_schedules for select to anon, authenticated using (true);
--> statement-breakpoint
create policy prohibited_read on public.prohibited_items for select to anon, authenticated using (active or app.is_admin_for(market_id, 'config'));
--> statement-breakpoint
create policy places_read on public.places for select to authenticated using (app.can_see_place(id));
--> statement-breakpoint
create policy errands_read on public.errands for select to authenticated
  using (customer_id = auth.uid() or runner_id = auth.uid() or app.is_admin_for(market_id, 'ops') or app.is_admin_for(market_id, 'support'));
--> statement-breakpoint
create policy errand_stops_read on public.errand_stops for select to authenticated using (app.can_see_errand(errand_id));
--> statement-breakpoint
create policy errand_items_read on public.errand_items for select to authenticated using (app.can_see_errand(errand_id));
--> statement-breakpoint
create policy errand_events_read on public.errand_events for select to authenticated using (app.can_see_errand(errand_id));
--> statement-breakpoint
create policy media_read on public.media for select to authenticated using (
  owner_id = auth.uid()
  or (errand_id is not null and app.can_see_errand(errand_id))
  or (conversation_id is not null and app.is_conversation_participant(conversation_id))
);
--> statement-breakpoint
create policy offers_read on public.offers for select to authenticated using (runner_id = auth.uid() or app.can_see_errand(errand_id));
--> statement-breakpoint
create policy conversations_read on public.conversations for select to authenticated using (app.is_conversation_participant(id));
--> statement-breakpoint
create policy messages_read on public.messages for select to authenticated using (app.is_conversation_participant(conversation_id));
--> statement-breakpoint
create policy conversation_reads_read on public.conversation_reads for select to authenticated using (user_id = auth.uid());
--> statement-breakpoint
create policy notifications_read on public.notifications for select to authenticated using (user_id = auth.uid());
--> statement-breakpoint
create policy notifications_mark_read on public.notifications for update to authenticated using (user_id = auth.uid()) with check (user_id = auth.uid());
--> statement-breakpoint
create policy push_read on public.push_subscriptions for select to authenticated using (user_id = auth.uid());
--> statement-breakpoint
create policy push_delete on public.push_subscriptions for delete to authenticated using (user_id = auth.uid());
--> statement-breakpoint
create policy blocks_read on public.blocks for select to authenticated using (blocker_id = auth.uid());
--> statement-breakpoint
create policy reports_read on public.reports for select to authenticated using (reporter_id = auth.uid() or app.is_admin_for(market_id, 'support'));
--> statement-breakpoint

-- ── Legal errand state transitions (mirrors src/modules/errands/domain/state-machine.ts) ──
create or replace function app.errand_transition_allowed(f public.errand_status, t public.errand_status) returns boolean
language sql immutable as $$
  select (f, t) in (
    ('draft','open'), ('draft','cancelled'),
    ('open','offer_accepted'), ('open','cancelled'), ('open','expired'),
    ('offer_accepted','funded'), ('offer_accepted','open'), ('offer_accepted','cancelled'),
    ('funded','in_progress'), ('funded','cancelled'), ('funded','disputed'),
    ('in_progress','completed_pending_confirmation'), ('in_progress','cancelled'), ('in_progress','disputed'),
    ('completed_pending_confirmation','confirmed'), ('completed_pending_confirmation','disputed'),
    ('disputed','confirmed'), ('disputed','refunded'),
    ('confirmed','paid_out'),
    ('cancelled','refunded')
  )
$$;
--> statement-breakpoint
create or replace function app.enforce_errand_rules() returns trigger language plpgsql security definer set search_path = public as $$
declare cust_market uuid; run_market uuid;
begin
  if tg_op = 'UPDATE' and new.status is distinct from old.status and not app.errand_transition_allowed(old.status, new.status) then
    raise exception 'illegal errand transition % -> %', old.status, new.status using errcode = 'check_violation';
  end if;
  if tg_op = 'INSERT' and new.status <> 'draft' then
    raise exception 'errands start as draft' using errcode = 'check_violation';
  end if;
  select market_id into cust_market from users where id = new.customer_id;
  if cust_market is distinct from new.market_id then
    raise exception 'errand market must equal the customer''s market' using errcode = 'check_violation';
  end if;
  if new.runner_id is not null and (tg_op = 'INSERT' or new.runner_id is distinct from old.runner_id) then
    select market_id into run_market from users where id = new.runner_id;
    if run_market is distinct from new.market_id then
      raise exception 'Runner must be in the errand''s market' using errcode = 'check_violation';
    end if;
    if new.runner_id = new.customer_id then
      raise exception 'a customer cannot run their own errand' using errcode = 'check_violation';
    end if;
  end if;
  new.updated_at = now();
  return new;
end $$;
--> statement-breakpoint
create trigger errands_rules before insert or update on public.errands for each row execute function app.enforce_errand_rules();
--> statement-breakpoint

create or replace function app.enforce_offer_rules() returns trigger language plpgsql security definer set search_path = public as $$
declare e record; run_market uuid;
begin
  select market_id, customer_id into e from errands where id = new.errand_id;
  select market_id into run_market from users where id = new.runner_id;
  if run_market is distinct from e.market_id or new.market_id is distinct from e.market_id then
    raise exception 'offer must be in the errand''s market' using errcode = 'check_violation';
  end if;
  if new.runner_id = e.customer_id then
    raise exception 'a customer cannot accept their own errand' using errcode = 'check_violation';
  end if;
  return new;
end $$;
--> statement-breakpoint
create trigger offers_rules before insert on public.offers for each row execute function app.enforce_offer_rules();
--> statement-breakpoint

create or replace function app.enforce_place_market() returns trigger language plpgsql security definer set search_path = public as $$
declare owner_market uuid; area_market uuid;
begin
  select market_id into owner_market from users where id = new.owner_id;
  select market_id into area_market from service_areas where id = new.service_area_id;
  if owner_market is distinct from new.market_id or area_market is distinct from new.market_id then
    raise exception 'place must be in the owner''s market and one of its service areas' using errcode = 'check_violation';
  end if;
  return new;
end $$;
--> statement-breakpoint
create trigger places_market before insert or update on public.places for each row execute function app.enforce_place_market();
--> statement-breakpoint
create trigger errand_events_append_only before update or delete on public.errand_events for each row execute function app.forbid_change();
--> statement-breakpoint
create trigger messages_append_only before update or delete on public.messages for each row execute function app.forbid_change();
--> statement-breakpoint

-- ── Supabase Realtime (skipped where the realtime schema doesn't exist, e.g. local tests) ──
-- Private channels: conversation:<id> and errand:<id>; authorised by RLS on realtime.messages.
-- NOT YET RUN against Supabase.
do $$
begin
  if exists (select 1 from pg_namespace where nspname = 'realtime') then
    execute $f$
      create or replace function app.broadcast_message() returns trigger language plpgsql security definer set search_path = public as $b$
      begin
        perform realtime.send(jsonb_build_object('id', new.id, 'conversation_id', new.conversation_id), 'message', 'conversation:' || new.conversation_id::text, true);
        return null;
      end $b$;
    $f$;
    execute 'create trigger messages_broadcast after insert on public.messages for each row execute function app.broadcast_message()';
    execute $f$
      create or replace function app.broadcast_errand() returns trigger language plpgsql security definer set search_path = public as $b$
      begin
        if new.status is distinct from old.status then
          perform realtime.send(jsonb_build_object('id', new.id, 'status', new.status), 'status', 'errand:' || new.id::text, true);
        end if;
        return null;
      end $b$;
    $f$;
    execute 'create trigger errands_broadcast after update on public.errands for each row execute function app.broadcast_errand()';
    execute $f$
      create policy realtime_participants on realtime.messages for select to authenticated using (
        (split_part(realtime.topic(), ':', 1) = 'conversation' and app.is_conversation_participant(split_part(realtime.topic(), ':', 2)::uuid))
        or (split_part(realtime.topic(), ':', 1) = 'errand' and app.can_see_errand(split_part(realtime.topic(), ':', 2)::uuid))
      )
    $f$;
  end if;
end $$;
