-- Market text moves from messages/*.json into market config, keyed by UI language ({"en": "Nigeria"}),
-- so a new market needs no code change. Markets can list several phone countries (phone_regions).
-- Old columns (name_key, launch_region_key, phone_region, phone_country_code) are dropped in 0007.
ALTER TABLE "markets" ADD COLUMN "name" jsonb;--> statement-breakpoint
ALTER TABLE "markets" ADD COLUMN "launch_region" jsonb;--> statement-breakpoint
ALTER TABLE "markets" ADD COLUMN "runner_id_requirement" jsonb;--> statement-breakpoint
ALTER TABLE "markets" ADD COLUMN "phone_regions" text[];--> statement-breakpoint
ALTER TABLE "service_areas" ADD COLUMN "name" jsonb;--> statement-breakpoint
-- Backfill from the English catalog as it stood (the seed re-applies these on every deploy).
UPDATE "markets" SET
  "name" = jsonb_build_object('en', CASE "code" WHEN 'NG' THEN 'Nigeria' WHEN 'VC' THEN 'St. Vincent' ELSE "code" END),
  "launch_region" = jsonb_build_object('en', CASE "code" WHEN 'NG' THEN 'Abuja' WHEN 'VC' THEN 'mainland St. Vincent' ELSE "code" END),
  "runner_id_requirement" = jsonb_build_object('en', CASE "code"
    WHEN 'NG' THEN 'Your NIN and a quick selfie check'
    ELSE 'A national ID card, passport or driver''s licence, and a quick selfie check' END),
  "phone_regions" = ARRAY["phone_region"::text];--> statement-breakpoint
UPDATE "service_areas" SET "name" = jsonb_build_object('en', CASE "slug"
  WHEN 'wuse-2' THEN 'Wuse 2'
  ELSE initcap(replace("slug", '-', ' ')) END);--> statement-breakpoint
ALTER TABLE "markets" ALTER COLUMN "name" SET NOT NULL;--> statement-breakpoint
ALTER TABLE "markets" ALTER COLUMN "launch_region" SET NOT NULL;--> statement-breakpoint
ALTER TABLE "markets" ALTER COLUMN "runner_id_requirement" SET NOT NULL;--> statement-breakpoint
ALTER TABLE "markets" ALTER COLUMN "phone_regions" SET NOT NULL;--> statement-breakpoint
ALTER TABLE "service_areas" ALTER COLUMN "name" SET NOT NULL;
