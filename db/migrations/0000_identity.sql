CREATE TYPE "public"."app_role" AS ENUM('customer', 'runner', 'admin', 'driver', 'business_member');--> statement-breakpoint
CREATE TYPE "public"."availability" AS ENUM('offline', 'online');--> statement-breakpoint
CREATE TYPE "public"."kyc_verification_status" AS ENUM('created', 'submitted', 'provider_approved', 'provider_rejected', 'needs_resubmission', 'admin_approved', 'admin_rejected', 'cancelled');--> statement-breakpoint
CREATE TYPE "public"."market_status" AS ENUM('draft', 'active', 'paused');--> statement-breakpoint
CREATE TYPE "public"."pricing_control" AS ENUM('customer_fixed', 'runner_offers', 'both', 'platform_set');--> statement-breakpoint
CREATE TYPE "public"."role_status" AS ENUM('active', 'revoked');--> statement-breakpoint
CREATE TYPE "public"."runner_kyc_status" AS ENUM('not_started', 'pending', 'in_review', 'resubmission_required', 'approved', 'rejected');--> statement-breakpoint
CREATE TYPE "public"."user_status" AS ENUM('active', 'suspended', 'banned', 'deleted');--> statement-breakpoint
CREATE TYPE "public"."vehicle_type" AS ENUM('none', 'bicycle', 'motorbike', 'car');--> statement-breakpoint
CREATE TYPE "public"."webhook_status" AS ENUM('received', 'processed', 'ignored', 'failed');--> statement-breakpoint
CREATE TABLE "errand_categories" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"market_id" uuid NOT NULL,
	"key" text NOT NULL,
	"name_key" text NOT NULL,
	"description_key" text NOT NULL,
	"purchase_allowed" boolean NOT NULL,
	"sort" integer DEFAULT 0 NOT NULL,
	"active" boolean DEFAULT true NOT NULL
);
--> statement-breakpoint
CREATE TABLE "markets" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"code" char(2) NOT NULL,
	"slug" text NOT NULL,
	"status" "market_status" DEFAULT 'draft' NOT NULL,
	"name_key" text NOT NULL,
	"launch_region_key" text NOT NULL,
	"currency_code" char(3) NOT NULL,
	"currency_minor_unit" smallint NOT NULL,
	"currency_display_symbol" text,
	"timezone" text NOT NULL,
	"phone_region" char(2) NOT NULL,
	"phone_country_code" text NOT NULL,
	"format_locale" text NOT NULL,
	"ui_languages" text[] NOT NULL,
	"data_region" text NOT NULL,
	"payment_provider" text NOT NULL,
	"payout_provider" text NOT NULL,
	"kyc_provider" text NOT NULL,
	"sms_provider" text NOT NULL,
	"maps_provider" text NOT NULL,
	"geo_countries" text[] NOT NULL,
	"kyc_auto_approve" boolean DEFAULT false NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "markets_code_unique" UNIQUE("code"),
	CONSTRAINT "markets_slug_unique" UNIQUE("slug")
);
--> statement-breakpoint
CREATE TABLE "runner_rules" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"market_id" uuid NOT NULL,
	"pricing_control" "pricing_control" NOT NULL,
	"max_concurrent_errands" integer NOT NULL,
	"acceptance_penalty_enabled" boolean DEFAULT false NOT NULL,
	"acceptance_rate_threshold_bps" integer,
	"acceptance_window_days" integer,
	"required_hours_per_week" integer,
	"min_age_years" integer NOT NULL,
	"required_kyc_level" text NOT NULL,
	"extra" jsonb DEFAULT '{}'::jsonb NOT NULL,
	"effective_from" timestamp with time zone DEFAULT now() NOT NULL,
	"effective_to" timestamp with time zone
);
--> statement-breakpoint
CREATE TABLE "service_areas" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"market_id" uuid NOT NULL,
	"slug" text NOT NULL,
	"name_key" text NOT NULL,
	"island" text,
	"active" boolean DEFAULT true NOT NULL,
	"sort" integer DEFAULT 0 NOT NULL
);
--> statement-breakpoint
CREATE TABLE "admin_grants" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"user_id" uuid NOT NULL,
	"market_id" uuid,
	"permissions" text[] NOT NULL,
	"granted_at" timestamp with time zone DEFAULT now() NOT NULL,
	"granted_by" uuid,
	"revoked_at" timestamp with time zone
);
--> statement-breakpoint
CREATE TABLE "customer_profiles" (
	"user_id" uuid PRIMARY KEY NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "kyc_verifications" (
	"id" uuid PRIMARY KEY NOT NULL,
	"user_id" uuid NOT NULL,
	"market_id" uuid NOT NULL,
	"provider" text NOT NULL,
	"provider_ref" text,
	"level" text NOT NULL,
	"status" "kyc_verification_status" DEFAULT 'created' NOT NULL,
	"result_summary" jsonb,
	"id_number_hash" char(64),
	"reviewed_by" uuid,
	"reviewed_at" timestamp with time zone,
	"review_reason_code" text,
	"review_note" text,
	"submitted_at" timestamp with time zone,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "runner_profiles" (
	"user_id" uuid PRIMARY KEY NOT NULL,
	"market_id" uuid NOT NULL,
	"kyc_status" "runner_kyc_status" DEFAULT 'not_started' NOT NULL,
	"kyc_approved_at" timestamp with time zone,
	"availability" "availability" DEFAULT 'offline' NOT NULL,
	"vehicle" "vehicle_type" DEFAULT 'none' NOT NULL,
	"bio" text,
	"emergency_contact_name" text,
	"emergency_contact_phone" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "runner_service_areas" (
	"user_id" uuid NOT NULL,
	"service_area_id" uuid NOT NULL,
	CONSTRAINT "runner_service_areas_user_id_service_area_id_pk" PRIMARY KEY("user_id","service_area_id")
);
--> statement-breakpoint
CREATE TABLE "user_roles" (
	"user_id" uuid NOT NULL,
	"role" "app_role" NOT NULL,
	"status" "role_status" DEFAULT 'active' NOT NULL,
	"granted_at" timestamp with time zone DEFAULT now() NOT NULL,
	"granted_by" uuid,
	CONSTRAINT "user_roles_user_id_role_pk" PRIMARY KEY("user_id","role")
);
--> statement-breakpoint
CREATE TABLE "users" (
	"id" uuid PRIMARY KEY NOT NULL,
	"market_id" uuid NOT NULL,
	"phone_e164" text NOT NULL,
	"display_name" text,
	"email" text,
	"locale" text DEFAULT 'en' NOT NULL,
	"status" "user_status" DEFAULT 'active' NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "users_phone_e164_unique" UNIQUE("phone_e164")
);
--> statement-breakpoint
CREATE TABLE "admin_audit_log" (
	"id" bigserial PRIMARY KEY NOT NULL,
	"actor_id" uuid NOT NULL,
	"market_id" uuid,
	"action" text NOT NULL,
	"subject_type" text NOT NULL,
	"subject_id" text NOT NULL,
	"data" jsonb DEFAULT '{}'::jsonb NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "provider_webhook_events" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"provider" text NOT NULL,
	"market_id" uuid,
	"event_id" text NOT NULL,
	"event_type" text NOT NULL,
	"signature_valid" boolean NOT NULL,
	"payload" jsonb NOT NULL,
	"status" "webhook_status" DEFAULT 'received' NOT NULL,
	"attempts" integer DEFAULT 0 NOT NULL,
	"error" text,
	"received_at" timestamp with time zone DEFAULT now() NOT NULL,
	"processed_at" timestamp with time zone
);
--> statement-breakpoint
CREATE TABLE "rate_limits" (
	"key" text NOT NULL,
	"window_start" timestamp with time zone NOT NULL,
	"count" integer DEFAULT 0 NOT NULL,
	CONSTRAINT "rate_limits_key_window_start_pk" PRIMARY KEY("key","window_start")
);
--> statement-breakpoint
CREATE TABLE "sandbox_outbox" (
	"id" bigserial PRIMARY KEY NOT NULL,
	"channel" text NOT NULL,
	"to_address" text NOT NULL,
	"body" text NOT NULL,
	"market_code" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "errand_categories" ADD CONSTRAINT "errand_categories_market_id_markets_id_fk" FOREIGN KEY ("market_id") REFERENCES "public"."markets"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "runner_rules" ADD CONSTRAINT "runner_rules_market_id_markets_id_fk" FOREIGN KEY ("market_id") REFERENCES "public"."markets"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "service_areas" ADD CONSTRAINT "service_areas_market_id_markets_id_fk" FOREIGN KEY ("market_id") REFERENCES "public"."markets"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "admin_grants" ADD CONSTRAINT "admin_grants_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "admin_grants" ADD CONSTRAINT "admin_grants_market_id_markets_id_fk" FOREIGN KEY ("market_id") REFERENCES "public"."markets"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "customer_profiles" ADD CONSTRAINT "customer_profiles_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "kyc_verifications" ADD CONSTRAINT "kyc_verifications_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "kyc_verifications" ADD CONSTRAINT "kyc_verifications_market_id_markets_id_fk" FOREIGN KEY ("market_id") REFERENCES "public"."markets"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "kyc_verifications" ADD CONSTRAINT "kyc_verifications_reviewed_by_users_id_fk" FOREIGN KEY ("reviewed_by") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "runner_profiles" ADD CONSTRAINT "runner_profiles_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "runner_profiles" ADD CONSTRAINT "runner_profiles_market_id_markets_id_fk" FOREIGN KEY ("market_id") REFERENCES "public"."markets"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "runner_service_areas" ADD CONSTRAINT "runner_service_areas_user_id_runner_profiles_user_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."runner_profiles"("user_id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "runner_service_areas" ADD CONSTRAINT "runner_service_areas_service_area_id_service_areas_id_fk" FOREIGN KEY ("service_area_id") REFERENCES "public"."service_areas"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "user_roles" ADD CONSTRAINT "user_roles_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "users" ADD CONSTRAINT "users_market_id_markets_id_fk" FOREIGN KEY ("market_id") REFERENCES "public"."markets"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "admin_audit_log" ADD CONSTRAINT "admin_audit_log_market_id_markets_id_fk" FOREIGN KEY ("market_id") REFERENCES "public"."markets"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "provider_webhook_events" ADD CONSTRAINT "provider_webhook_events_market_id_markets_id_fk" FOREIGN KEY ("market_id") REFERENCES "public"."markets"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
CREATE UNIQUE INDEX "errand_categories_market_key" ON "errand_categories" USING btree ("market_id","key");--> statement-breakpoint
CREATE INDEX "errand_categories_market" ON "errand_categories" USING btree ("market_id");--> statement-breakpoint
CREATE UNIQUE INDEX "runner_rules_one_current" ON "runner_rules" USING btree ("market_id") WHERE effective_to is null;--> statement-breakpoint
CREATE UNIQUE INDEX "service_areas_market_slug" ON "service_areas" USING btree ("market_id","slug");--> statement-breakpoint
CREATE INDEX "admin_grants_user" ON "admin_grants" USING btree ("user_id");--> statement-breakpoint
CREATE INDEX "kyc_verifications_user" ON "kyc_verifications" USING btree ("user_id");--> statement-breakpoint
CREATE INDEX "kyc_verifications_market_status" ON "kyc_verifications" USING btree ("market_id","status");--> statement-breakpoint
CREATE UNIQUE INDEX "kyc_verifications_provider_ref" ON "kyc_verifications" USING btree ("provider","provider_ref");--> statement-breakpoint
CREATE INDEX "kyc_verifications_id_hash" ON "kyc_verifications" USING btree ("id_number_hash");--> statement-breakpoint
CREATE INDEX "runner_profiles_market_status" ON "runner_profiles" USING btree ("market_id","kyc_status");--> statement-breakpoint
CREATE INDEX "users_market" ON "users" USING btree ("market_id");--> statement-breakpoint
CREATE INDEX "admin_audit_market_time" ON "admin_audit_log" USING btree ("market_id","created_at");--> statement-breakpoint
CREATE UNIQUE INDEX "provider_webhook_events_dedupe" ON "provider_webhook_events" USING btree ("provider","event_id");--> statement-breakpoint
CREATE INDEX "sandbox_outbox_to" ON "sandbox_outbox" USING btree ("to_address","created_at");