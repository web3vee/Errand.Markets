-- Decision 2026-11-26: 5% service fee on the errand price (paid by the customer) and no minimum
-- errand price, in every launch market. Fee schedules are versioned: close the current row, open a new
-- one. Errands already published keep the schedule they were published under (errands.fee_schedule_id).
create temp table _fee_prev as
  select * from public.market_fee_schedules where effective_to is null and service_fee_bps is distinct from 500;
--> statement-breakpoint
update public.market_fee_schedules set effective_to = now() where id in (select id from _fee_prev);
--> statement-breakpoint
insert into public.market_fee_schedules (
  market_id, commission_bps, service_fee_bps, service_fee_fixed_minor, service_fee_min_minor, service_fee_max_minor,
  cancellation_fee_minor, min_errand_price_minor, max_item_cost_minor, auto_release_hours, reminder_offsets_hours,
  unfunded_offer_timeout_minutes, errand_default_expiry_hours
)
select market_id, commission_bps, 500, service_fee_fixed_minor, service_fee_min_minor, service_fee_max_minor,
  cancellation_fee_minor, null, max_item_cost_minor, auto_release_hours, reminder_offsets_hours,
  unfunded_offer_timeout_minutes, errand_default_expiry_hours
from _fee_prev;
--> statement-breakpoint
drop table _fee_prev;
