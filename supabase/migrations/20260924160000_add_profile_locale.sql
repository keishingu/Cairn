ALTER TABLE "public"."profiles" ADD COLUMN "locale" text DEFAULT 'system' NOT NULL;

ALTER TABLE "public"."profiles" ADD CONSTRAINT "profiles_locale_check" CHECK ("locale" in ('ja', 'en', 'system'));
