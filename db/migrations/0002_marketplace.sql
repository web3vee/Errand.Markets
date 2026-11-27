CREATE TYPE "public"."actor_type" AS ENUM('customer', 'runner', 'admin', 'system', 'provider');--> statement-breakpoint
CREATE TYPE "public"."conversation_status" AS ENUM('open', 'read_only');--> statement-breakpoint
CREATE TYPE "public"."delivery_channel" AS ENUM('push', 'sms');--> statement-breakpoint
CREATE TYPE "public"."delivery_status" AS ENUM('queued', 'sent', 'failed', 'skipped');--> statement-breakpoint
CREATE TYPE "public"."errand_review_state" AS ENUM('none', 'pending_review', 'cleared', 'rejected');--> statement-breakpoint
CREATE TYPE "public"."errand_status" AS ENUM('draft', 'open', 'offer_accepted', 'funded', 'in_progress', 'completed_pending_confirmation', 'confirmed', 'paid_out', 'cancelled', 'disputed', 'refunded', 'expired');--> statement-breakpoint
CREATE TYPE "public"."media_kind" AS ENUM('errand_reference', 'message_photo', 'proof', 'receipt', 'avatar');--> statement-breakpoint
CREATE TYPE "public"."offer_kind" AS ENUM('accept_price', 'counter_offer');--> statement-breakpoint
CREATE TYPE "public"."offer_status" AS ENUM('pending', 'accepted', 'withdrawn', 'declined', 'expired', 'superseded');--> statement-breakpoint
CREATE TYPE "public"."pin_source" AS ENUM('area_center', 'device', 'map');--> statement-breakpoint
CREATE TYPE "public"."pricing_mode" AS ENUM('fixed', 'offers');--> statement-breakpoint
CREATE TYPE "public"."prohibited_action" AS ENUM('block', 'review');--> statement-breakpoint
CREATE TYPE "public"."report_status" AS ENUM('open', 'actioned', 'dismissed');--> statement-breakpoint
CREATE TYPE "public"."stop_kind" AS ENUM('pickup', 'purchase', 'collect', 'dropoff');--> statement-breakpoint
CREATE TYPE "public"."time_window_kind" AS ENUM('asap', 'by_time');--> statement-breakpoint
CREATE TABLE "market_fee_schedules" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"market_id" uuid NOT NULL,
	"commission_bps" integer NOT NULL,
	"service_fee_bps" integer,
	"service_fee_fixed_minor" bigint,
	"service_fee_min_minor" bigint,
	"service_fee_max_minor" bigint,
	"cancellation_fee_minor" bigint,
	"min_errand_price_minor" bigint,
	"max_item_cost_minor" bigint,
	"auto_release_hours" integer NOT NULL,
	"reminder_offsets_hours" integer[] NOT NULL,
	"unfunded_offer_timeout_minutes" integer NOT NULL,
	"errand_default_expiry_hours" integer NOT NULL,
	"effective_from" timestamp with time zone DEFAULT now() NOT NULL,
	"effective_to" timestamp with time zone,
	"created_by" uuid
);
--> statement-breakpoint
CREATE TABLE "prohibited_items" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"market_id" uuid NOT NULL,
	"label" text NOT NULL,
	"keywords" text[] NOT NULL,
	"action" "prohibited_action" NOT NULL,
	"active" boolean DEFAULT true NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "errand_events" (
	"id" bigserial PRIMARY KEY NOT NULL,
	"errand_id" uuid NOT NULL,
	"from_status" text,
	"to_status" text NOT NULL,
	"event" text NOT NULL,
	"actor_type" "actor_type" NOT NULL,
	"actor_id" uuid,
	"data" jsonb DEFAULT '{}'::jsonb NOT NULL,
	"at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "errand_items" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"errand_id" uuid NOT NULL,
	"name" text NOT NULL,
	"qty" integer NOT NULL,
	"est_unit_price_minor" bigint NOT NULL,
	"notes" text
);
--> statement-breakpoint
CREATE TABLE "errand_stops" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"errand_id" uuid NOT NULL,
	"seq" smallint NOT NULL,
	"kind" "stop_kind" NOT NULL,
	"place_id" uuid NOT NULL,
	"instructions" text
);
--> statement-breakpoint
CREATE TABLE "errands" (
	"id" uuid PRIMARY KEY NOT NULL,
	"market_id" uuid NOT NULL,
	"customer_id" uuid NOT NULL,
	"runner_id" uuid,
	"category_id" uuid NOT NULL,
	"title" text NOT NULL,
	"description" text NOT NULL,
	"status" "errand_status" DEFAULT 'draft' NOT NULL,
	"review_state" "errand_review_state" DEFAULT 'none' NOT NULL,
	"review_note" text,
	"version" integer DEFAULT 1 NOT NULL,
	"pricing_mode" "pricing_mode" DEFAULT 'fixed' NOT NULL,
	"currency" char(3) NOT NULL,
	"price_minor" bigint NOT NULL,
	"requires_purchase" boolean DEFAULT false NOT NULL,
	"item_estimate_minor" bigint DEFAULT 0 NOT NULL,
	"fee_schedule_id" uuid,
	"accepted_offer_id" uuid,
	"origin_service_area_id" uuid NOT NULL,
	"window_kind" time_window_kind DEFAULT 'asap' NOT NULL,
	"window_end" timestamp with time zone,
	"expires_at" timestamp with time zone,
	"published_at" timestamp with time zone,
	"accepted_at" timestamp with time zone,
	"funded_at" timestamp with time zone,
	"started_at" timestamp with time zone,
	"completed_at" timestamp with time zone,
	"auto_release_at" timestamp with time zone,
	"confirmed_at" timestamp with time zone,
	"cancelled_at" timestamp with time zone,
	"cancelled_by" uuid,
	"cancel_reason_code" text,
	"priority" text DEFAULT 'standard' NOT NULL,
	"business_account_id" uuid,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "media" (
	"id" uuid PRIMARY KEY NOT NULL,
	"market_id" uuid NOT NULL,
	"owner_id" uuid NOT NULL,
	"kind" "media_kind" NOT NULL,
	"errand_id" uuid,
	"conversation_id" uuid,
	"storage_key" text NOT NULL,
	"content_type" text NOT NULL,
	"bytes" integer NOT NULL,
	"width" integer NOT NULL,
	"height" integer NOT NULL,
	"sha256" char(64) NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "offers" (
	"id" uuid PRIMARY KEY NOT NULL,
	"market_id" uuid NOT NULL,
	"errand_id" uuid NOT NULL,
	"runner_id" uuid NOT NULL,
	"kind" "offer_kind" NOT NULL,
	"amount_minor" bigint NOT NULL,
	"currency" char(3) NOT NULL,
	"message" text,
	"status" "offer_status" NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "places" (
	"id" uuid PRIMARY KEY NOT NULL,
	"market_id" uuid NOT NULL,
	"owner_id" uuid NOT NULL,
	"lat" numeric(9, 6) NOT NULL,
	"lng" numeric(9, 6) NOT NULL,
	"pin_source" "pin_source" NOT NULL,
	"service_area_id" uuid NOT NULL,
	"landmark" text NOT NULL,
	"address_text" text,
	"contact_name" text,
	"contact_phone_e164" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "blocks" (
	"blocker_id" uuid NOT NULL,
	"blocked_id" uuid NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "blocks_blocker_id_blocked_id_pk" PRIMARY KEY("blocker_id","blocked_id")
);
--> statement-breakpoint
CREATE TABLE "conversation_reads" (
	"conversation_id" uuid NOT NULL,
	"user_id" uuid NOT NULL,
	"last_read_at" timestamp with time zone NOT NULL,
	CONSTRAINT "conversation_reads_conversation_id_user_id_pk" PRIMARY KEY("conversation_id","user_id")
);
--> statement-breakpoint
CREATE TABLE "conversations" (
	"id" uuid PRIMARY KEY NOT NULL,
	"market_id" uuid NOT NULL,
	"errand_id" uuid NOT NULL,
	"customer_id" uuid NOT NULL,
	"runner_id" uuid NOT NULL,
	"status" "conversation_status" DEFAULT 'open' NOT NULL,
	"last_message_at" timestamp with time zone,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "messages" (
	"id" uuid PRIMARY KEY NOT NULL,
	"conversation_id" uuid NOT NULL,
	"sender_id" uuid NOT NULL,
	"body" text NOT NULL,
	"media_id" uuid,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "notification_deliveries" (
	"id" uuid PRIMARY KEY NOT NULL,
	"notification_id" uuid NOT NULL,
	"channel" "delivery_channel" NOT NULL,
	"status" "delivery_status" DEFAULT 'queued' NOT NULL,
	"provider_ref" text,
	"error" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"sent_at" timestamp with time zone
);
--> statement-breakpoint
CREATE TABLE "notifications" (
	"id" uuid PRIMARY KEY NOT NULL,
	"user_id" uuid NOT NULL,
	"market_id" uuid NOT NULL,
	"type" text NOT NULL,
	"payload" jsonb DEFAULT '{}'::jsonb NOT NULL,
	"read_at" timestamp with time zone,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "push_subscriptions" (
	"id" uuid PRIMARY KEY NOT NULL,
	"user_id" uuid NOT NULL,
	"endpoint" text NOT NULL,
	"p256dh" text NOT NULL,
	"auth" text NOT NULL,
	"user_agent" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"last_used_at" timestamp with time zone,
	CONSTRAINT "push_subscriptions_endpoint_unique" UNIQUE("endpoint")
);
--> statement-breakpoint
CREATE TABLE "reports" (
	"id" uuid PRIMARY KEY NOT NULL,
	"market_id" uuid NOT NULL,
	"reporter_id" uuid NOT NULL,
	"subject_type" text NOT NULL,
	"subject_id" uuid NOT NULL,
	"reason_code" text NOT NULL,
	"details" text,
	"status" "report_status" DEFAULT 'open' NOT NULL,
	"assigned_to" uuid,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "service_areas" ADD COLUMN "center_lat" numeric(9, 6);--> statement-breakpoint
ALTER TABLE "service_areas" ADD COLUMN "center_lng" numeric(9, 6);--> statement-breakpoint
ALTER TABLE "service_areas" ADD COLUMN "boundary" jsonb;--> statement-breakpoint
ALTER TABLE "service_areas" ADD COLUMN "boundary_status" text DEFAULT 'approximate' NOT NULL;--> statement-breakpoint
ALTER TABLE "market_fee_schedules" ADD CONSTRAINT "market_fee_schedules_market_id_markets_id_fk" FOREIGN KEY ("market_id") REFERENCES "public"."markets"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "prohibited_items" ADD CONSTRAINT "prohibited_items_market_id_markets_id_fk" FOREIGN KEY ("market_id") REFERENCES "public"."markets"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "errand_events" ADD CONSTRAINT "errand_events_errand_id_errands_id_fk" FOREIGN KEY ("errand_id") REFERENCES "public"."errands"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "errand_items" ADD CONSTRAINT "errand_items_errand_id_errands_id_fk" FOREIGN KEY ("errand_id") REFERENCES "public"."errands"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "errand_stops" ADD CONSTRAINT "errand_stops_errand_id_errands_id_fk" FOREIGN KEY ("errand_id") REFERENCES "public"."errands"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "errand_stops" ADD CONSTRAINT "errand_stops_place_id_places_id_fk" FOREIGN KEY ("place_id") REFERENCES "public"."places"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "errands" ADD CONSTRAINT "errands_market_id_markets_id_fk" FOREIGN KEY ("market_id") REFERENCES "public"."markets"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "errands" ADD CONSTRAINT "errands_customer_id_users_id_fk" FOREIGN KEY ("customer_id") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "errands" ADD CONSTRAINT "errands_runner_id_users_id_fk" FOREIGN KEY ("runner_id") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "errands" ADD CONSTRAINT "errands_category_id_errand_categories_id_fk" FOREIGN KEY ("category_id") REFERENCES "public"."errand_categories"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "errands" ADD CONSTRAINT "errands_fee_schedule_id_market_fee_schedules_id_fk" FOREIGN KEY ("fee_schedule_id") REFERENCES "public"."market_fee_schedules"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "errands" ADD CONSTRAINT "errands_origin_service_area_id_service_areas_id_fk" FOREIGN KEY ("origin_service_area_id") REFERENCES "public"."service_areas"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "media" ADD CONSTRAINT "media_market_id_markets_id_fk" FOREIGN KEY ("market_id") REFERENCES "public"."markets"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "media" ADD CONSTRAINT "media_owner_id_users_id_fk" FOREIGN KEY ("owner_id") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "media" ADD CONSTRAINT "media_errand_id_errands_id_fk" FOREIGN KEY ("errand_id") REFERENCES "public"."errands"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "offers" ADD CONSTRAINT "offers_market_id_markets_id_fk" FOREIGN KEY ("market_id") REFERENCES "public"."markets"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "offers" ADD CONSTRAINT "offers_errand_id_errands_id_fk" FOREIGN KEY ("errand_id") REFERENCES "public"."errands"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "offers" ADD CONSTRAINT "offers_runner_id_users_id_fk" FOREIGN KEY ("runner_id") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "places" ADD CONSTRAINT "places_market_id_markets_id_fk" FOREIGN KEY ("market_id") REFERENCES "public"."markets"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "places" ADD CONSTRAINT "places_owner_id_users_id_fk" FOREIGN KEY ("owner_id") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "places" ADD CONSTRAINT "places_service_area_id_service_areas_id_fk" FOREIGN KEY ("service_area_id") REFERENCES "public"."service_areas"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "blocks" ADD CONSTRAINT "blocks_blocker_id_users_id_fk" FOREIGN KEY ("blocker_id") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "blocks" ADD CONSTRAINT "blocks_blocked_id_users_id_fk" FOREIGN KEY ("blocked_id") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "conversation_reads" ADD CONSTRAINT "conversation_reads_conversation_id_conversations_id_fk" FOREIGN KEY ("conversation_id") REFERENCES "public"."conversations"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "conversation_reads" ADD CONSTRAINT "conversation_reads_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "conversations" ADD CONSTRAINT "conversations_market_id_markets_id_fk" FOREIGN KEY ("market_id") REFERENCES "public"."markets"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "conversations" ADD CONSTRAINT "conversations_errand_id_errands_id_fk" FOREIGN KEY ("errand_id") REFERENCES "public"."errands"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "conversations" ADD CONSTRAINT "conversations_customer_id_users_id_fk" FOREIGN KEY ("customer_id") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "conversations" ADD CONSTRAINT "conversations_runner_id_users_id_fk" FOREIGN KEY ("runner_id") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "messages" ADD CONSTRAINT "messages_conversation_id_conversations_id_fk" FOREIGN KEY ("conversation_id") REFERENCES "public"."conversations"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "messages" ADD CONSTRAINT "messages_sender_id_users_id_fk" FOREIGN KEY ("sender_id") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "notification_deliveries" ADD CONSTRAINT "notification_deliveries_notification_id_notifications_id_fk" FOREIGN KEY ("notification_id") REFERENCES "public"."notifications"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "notifications" ADD CONSTRAINT "notifications_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "notifications" ADD CONSTRAINT "notifications_market_id_markets_id_fk" FOREIGN KEY ("market_id") REFERENCES "public"."markets"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "push_subscriptions" ADD CONSTRAINT "push_subscriptions_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "reports" ADD CONSTRAINT "reports_market_id_markets_id_fk" FOREIGN KEY ("market_id") REFERENCES "public"."markets"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "reports" ADD CONSTRAINT "reports_reporter_id_users_id_fk" FOREIGN KEY ("reporter_id") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
CREATE UNIQUE INDEX "market_fee_schedules_one_current" ON "market_fee_schedules" USING btree ("market_id") WHERE effective_to is null;--> statement-breakpoint
CREATE INDEX "prohibited_items_market" ON "prohibited_items" USING btree ("market_id");--> statement-breakpoint
CREATE INDEX "errand_events_errand" ON "errand_events" USING btree ("errand_id","at");--> statement-breakpoint
CREATE UNIQUE INDEX "errand_stops_seq" ON "errand_stops" USING btree ("errand_id","seq");--> statement-breakpoint
CREATE INDEX "errands_market_status" ON "errands" USING btree ("market_id","status","published_at");--> statement-breakpoint
CREATE INDEX "errands_customer" ON "errands" USING btree ("customer_id","created_at");--> statement-breakpoint
CREATE INDEX "errands_runner" ON "errands" USING btree ("runner_id","status");--> statement-breakpoint
CREATE INDEX "errands_expiry" ON "errands" USING btree ("status","expires_at");--> statement-breakpoint
CREATE INDEX "media_errand" ON "media" USING btree ("errand_id");--> statement-breakpoint
CREATE INDEX "media_conversation" ON "media" USING btree ("conversation_id");--> statement-breakpoint
CREATE INDEX "offers_errand" ON "offers" USING btree ("errand_id");--> statement-breakpoint
CREATE UNIQUE INDEX "offers_one_accepted_per_errand" ON "offers" USING btree ("errand_id") WHERE status = 'accepted';--> statement-breakpoint
CREATE INDEX "blocks_blocked" ON "blocks" USING btree ("blocked_id");--> statement-breakpoint
CREATE UNIQUE INDEX "conversations_errand_runner" ON "conversations" USING btree ("errand_id","runner_id");--> statement-breakpoint
CREATE INDEX "conversations_customer" ON "conversations" USING btree ("customer_id");--> statement-breakpoint
CREATE INDEX "conversations_runner" ON "conversations" USING btree ("runner_id");--> statement-breakpoint
CREATE INDEX "messages_conversation" ON "messages" USING btree ("conversation_id","id");--> statement-breakpoint
CREATE INDEX "notification_deliveries_notification" ON "notification_deliveries" USING btree ("notification_id");--> statement-breakpoint
CREATE INDEX "notifications_user" ON "notifications" USING btree ("user_id","created_at");--> statement-breakpoint
CREATE INDEX "reports_market_status" ON "reports" USING btree ("market_id","status");