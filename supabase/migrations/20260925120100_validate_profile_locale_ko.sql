-- Validate profiles_locale_check after the NOT VALID add commits, so the scan
-- only needs SHARE UPDATE EXCLUSIVE instead of holding ACCESS EXCLUSIVE across validation.
ALTER TABLE "public"."profiles" VALIDATE CONSTRAINT "profiles_locale_check";
