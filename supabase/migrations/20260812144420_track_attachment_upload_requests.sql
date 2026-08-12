ALTER TABLE "upload_requests" ALTER COLUMN "project_id" DROP NOT NULL;--> statement-breakpoint
ALTER TABLE "upload_requests" ADD COLUMN "storage_bucket" text DEFAULT 'gallery' NOT NULL;--> statement-breakpoint
ALTER TABLE "upload_requests" ALTER COLUMN "requested_by" DROP NOT NULL;--> statement-breakpoint
ALTER TABLE "upload_requests" DROP CONSTRAINT "upload_requests_requested_by_profiles_id_fk";--> statement-breakpoint
ALTER TABLE "upload_requests" ADD CONSTRAINT "upload_requests_requested_by_profiles_id_fk" FOREIGN KEY ("requested_by") REFERENCES "public"."profiles"("id") ON DELETE set null ON UPDATE no action;
