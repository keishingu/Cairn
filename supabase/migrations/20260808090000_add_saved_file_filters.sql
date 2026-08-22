CREATE TABLE "saved_file_filters" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"workspace_id" uuid NOT NULL,
	"user_id" uuid NOT NULL,
	"name" text NOT NULL,
	"conditions" jsonb DEFAULT '{}'::jsonb NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "saved_file_filters_name_length" CHECK (length(trim("saved_file_filters"."name")) between 1 and 50)
);
--> statement-breakpoint
ALTER TABLE "saved_file_filters" ADD CONSTRAINT "saved_file_filters_workspace_id_workspaces_id_fk" FOREIGN KEY ("workspace_id") REFERENCES "public"."workspaces"("id") ON DELETE cascade ON UPDATE no action;
--> statement-breakpoint
ALTER TABLE "saved_file_filters" ADD CONSTRAINT "saved_file_filters_user_id_profiles_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."profiles"("id") ON DELETE cascade ON UPDATE no action;
--> statement-breakpoint
CREATE UNIQUE INDEX "saved_file_filters_workspace_user_name_unique" ON "saved_file_filters" USING btree ("workspace_id", "user_id", lower("name"));
--> statement-breakpoint
CREATE INDEX "saved_file_filters_workspace_user_idx" ON "saved_file_filters" USING btree ("workspace_id", "user_id");
--> statement-breakpoint
ALTER TABLE "saved_file_filters" ENABLE ROW LEVEL SECURITY;
--> statement-breakpoint
REVOKE ALL ON TABLE "saved_file_filters" FROM anon, authenticated;
