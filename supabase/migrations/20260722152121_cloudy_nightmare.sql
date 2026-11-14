ALTER TABLE "profiles" ADD COLUMN "theme" text DEFAULT 'system' NOT NULL;--> statement-breakpoint
ALTER TABLE "profiles" ADD COLUMN "accent_id" text DEFAULT 'emerald' NOT NULL;--> statement-breakpoint
ALTER TABLE "profiles" ADD CONSTRAINT "profiles_theme_check" CHECK ("profiles"."theme" in ('light', 'system', 'dark'));--> statement-breakpoint
ALTER TABLE "profiles" ADD CONSTRAINT "profiles_accent_id_check" CHECK ("profiles"."accent_id" in ('emerald', 'blue', 'violet', 'rose', 'pink', 'amber', 'cyan'));
