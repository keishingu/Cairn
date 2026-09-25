-- Allow Korean as an explicit profiles.locale preference alongside ja / en / system.
ALTER TABLE "public"."profiles" DROP CONSTRAINT "profiles_locale_check";
ALTER TABLE "public"."profiles" ADD CONSTRAINT "profiles_locale_check" CHECK ("locale" in ('ja', 'en', 'ko', 'system'));
