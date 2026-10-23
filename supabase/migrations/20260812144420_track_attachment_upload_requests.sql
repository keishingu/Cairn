ALTER TABLE "upload_requests" ALTER COLUMN "project_id" DROP NOT NULL;--> statement-breakpoint
ALTER TABLE "upload_requests" ADD COLUMN "storage_bucket" text DEFAULT 'gallery' NOT NULL;
