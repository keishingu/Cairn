CREATE TABLE "upload_requests" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"workspace_id" uuid NOT NULL,
	"project_id" uuid NOT NULL,
	"requested_by" uuid NOT NULL,
	"file_name" text NOT NULL,
	"derived_mime_type" text NOT NULL,
	"original_mime_type" text,
	"derived_storage_path" text NOT NULL,
	"original_storage_path" text,
	"file_id" uuid,
	"expires_at" timestamp with time zone NOT NULL,
	"finalized_at" timestamp with time zone,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "upload_requests" ADD CONSTRAINT "upload_requests_workspace_id_workspaces_id_fk" FOREIGN KEY ("workspace_id") REFERENCES "public"."workspaces"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "upload_requests" ADD CONSTRAINT "upload_requests_project_id_projects_id_fk" FOREIGN KEY ("project_id") REFERENCES "public"."projects"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "upload_requests" ADD CONSTRAINT "upload_requests_requested_by_profiles_id_fk" FOREIGN KEY ("requested_by") REFERENCES "public"."profiles"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "upload_requests" ADD CONSTRAINT "upload_requests_file_id_files_id_fk" FOREIGN KEY ("file_id") REFERENCES "public"."files"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE UNIQUE INDEX "upload_requests_derived_storage_path_unique" ON "upload_requests" USING btree ("derived_storage_path");--> statement-breakpoint
CREATE UNIQUE INDEX "upload_requests_original_storage_path_unique" ON "upload_requests" USING btree ("original_storage_path");--> statement-breakpoint
CREATE INDEX "idx_upload_requests_expiration" ON "upload_requests" USING btree ("expires_at");--> statement-breakpoint
CREATE INDEX "idx_upload_requests_project_pending" ON "upload_requests" USING btree ("project_id","finalized_at");