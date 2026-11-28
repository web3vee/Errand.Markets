ALTER TABLE "markets" DROP COLUMN "name_key";--> statement-breakpoint
ALTER TABLE "markets" DROP COLUMN "launch_region_key";--> statement-breakpoint
ALTER TABLE "markets" DROP COLUMN "phone_region";--> statement-breakpoint
ALTER TABLE "markets" DROP COLUMN "phone_country_code";--> statement-breakpoint
ALTER TABLE "service_areas" DROP COLUMN "name_key";--> statement-breakpoint
ALTER TABLE "markets" ADD CONSTRAINT "markets_phone_regions_nonempty" CHECK (cardinality("markets"."phone_regions") >= 1);