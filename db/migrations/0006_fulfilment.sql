CREATE TYPE "public"."dispute_outcome" AS ENUM('release_runner', 'refund_customer');--> statement-breakpoint
CREATE TYPE "public"."dispute_status" AS ENUM('open', 'resolved');--> statement-breakpoint
CREATE TYPE "public"."party_role" AS ENUM('customer', 'runner');--> statement-breakpoint
CREATE TABLE "disputes" (
	"id" uuid PRIMARY KEY NOT NULL,
	"market_id" uuid NOT NULL,
	"errand_id" uuid NOT NULL,
	"raised_by" uuid NOT NULL,
	"raised_role" "party_role" NOT NULL,
	"from_status" "errand_status" NOT NULL,
	"reason_code" text NOT NULL,
	"details" text,
	"status" "dispute_status" DEFAULT 'open' NOT NULL,
	"outcome" "dispute_outcome",
	"resolved_by" uuid,
	"resolved_at" timestamp with time zone,
	"resolution_note" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "ratings" (
	"id" uuid PRIMARY KEY NOT NULL,
	"market_id" uuid NOT NULL,
	"errand_id" uuid NOT NULL,
	"rater_id" uuid NOT NULL,
	"ratee_id" uuid NOT NULL,
	"rater_role" "party_role" NOT NULL,
	"stars" smallint NOT NULL,
	"comment" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "errands" ADD COLUMN "item_actual_minor" bigint;--> statement-breakpoint
ALTER TABLE "errands" ADD COLUMN "reminders_sent" smallint DEFAULT 0 NOT NULL;--> statement-breakpoint
ALTER TABLE "disputes" ADD CONSTRAINT "disputes_market_id_markets_id_fk" FOREIGN KEY ("market_id") REFERENCES "public"."markets"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "disputes" ADD CONSTRAINT "disputes_errand_id_errands_id_fk" FOREIGN KEY ("errand_id") REFERENCES "public"."errands"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "disputes" ADD CONSTRAINT "disputes_raised_by_users_id_fk" FOREIGN KEY ("raised_by") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "disputes" ADD CONSTRAINT "disputes_resolved_by_users_id_fk" FOREIGN KEY ("resolved_by") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "ratings" ADD CONSTRAINT "ratings_market_id_markets_id_fk" FOREIGN KEY ("market_id") REFERENCES "public"."markets"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "ratings" ADD CONSTRAINT "ratings_errand_id_errands_id_fk" FOREIGN KEY ("errand_id") REFERENCES "public"."errands"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "ratings" ADD CONSTRAINT "ratings_rater_id_users_id_fk" FOREIGN KEY ("rater_id") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "ratings" ADD CONSTRAINT "ratings_ratee_id_users_id_fk" FOREIGN KEY ("ratee_id") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "disputes_market_status" ON "disputes" USING btree ("market_id","status","created_at");--> statement-breakpoint
CREATE UNIQUE INDEX "disputes_one_open_per_errand" ON "disputes" USING btree ("errand_id") WHERE status = 'open';--> statement-breakpoint
CREATE UNIQUE INDEX "ratings_one_per_rater" ON "ratings" USING btree ("errand_id","rater_id");--> statement-breakpoint
CREATE INDEX "ratings_ratee" ON "ratings" USING btree ("ratee_id");