ALTER TABLE "profiles" ADD COLUMN "calendar_week_start" text DEFAULT 'sunday' NOT NULL;--> statement-breakpoint
ALTER TABLE "profiles" ADD CONSTRAINT "profiles_calendar_week_start_check" CHECK ("profiles"."calendar_week_start" in ('sunday', 'monday'));
