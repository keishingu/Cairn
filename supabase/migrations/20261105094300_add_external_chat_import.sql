CREATE TABLE "import_identities" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"workspace_id" uuid NOT NULL,
	"source" text NOT NULL,
	"external_key" text NOT NULL,
	"display_name" text,
	"is_anonymous" boolean DEFAULT false NOT NULL,
	"kind" text NOT NULL,
	"linked_user_id" uuid,
	"linked_by" uuid,
	"linked_at" timestamp with time zone,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "import_identities_workspace_source_key" UNIQUE("workspace_id","source","external_key"),
	CONSTRAINT "import_identities_anonymous_unlinked" CHECK (not ("import_identities"."is_anonymous" and "import_identities"."linked_user_id" is not null)),
	CONSTRAINT "import_identities_kind_check" CHECK ("import_identities"."kind" in ('exporter', 'named', 'unnamed-participant', 'anonymous')),
	CONSTRAINT "import_identities_external_key_length" CHECK (char_length("import_identities"."external_key") between 1 and 300)
);
--> statement-breakpoint
ALTER TABLE "import_identities" ENABLE ROW LEVEL SECURITY;--> statement-breakpoint
CREATE TABLE "import_job_conversations" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"job_id" uuid NOT NULL,
	"external_conversation_id" text NOT NULL,
	"channel_id" uuid,
	"status" text DEFAULT 'pending' NOT NULL,
	"total_messages" integer DEFAULT 0 NOT NULL,
	"imported_messages" integer DEFAULT 0 NOT NULL,
	"duplicate_messages" integer DEFAULT 0 NOT NULL,
	"failed_messages" integer DEFAULT 0 NOT NULL,
	"error" text,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "import_job_conversations_unique" UNIQUE("job_id","external_conversation_id"),
	CONSTRAINT "import_job_conversations_status_check" CHECK ("import_job_conversations"."status" in ('pending', 'running', 'completed', 'failed'))
);
--> statement-breakpoint
ALTER TABLE "import_job_conversations" ENABLE ROW LEVEL SECURITY;--> statement-breakpoint
CREATE TABLE "import_jobs" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"workspace_id" uuid NOT NULL,
	"source" text NOT NULL,
	"status" text DEFAULT 'running' NOT NULL,
	"created_by" uuid,
	"exported_at" timestamp with time zone,
	"stats" jsonb DEFAULT '{}'::jsonb NOT NULL,
	"report" jsonb DEFAULT '{}'::jsonb NOT NULL,
	"error" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	"finished_at" timestamp with time zone,
	CONSTRAINT "import_jobs_status_check" CHECK ("import_jobs"."status" in ('running', 'completed', 'failed', 'cancelled')),
	CONSTRAINT "import_jobs_source_check" CHECK ("import_jobs"."source" in ('teams-consumer'))
);
--> statement-breakpoint
ALTER TABLE "import_jobs" ENABLE ROW LEVEL SECURITY;--> statement-breakpoint
CREATE TABLE "imported_files" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"workspace_id" uuid NOT NULL,
	"source" text NOT NULL,
	"external_object_id" text NOT NULL,
	"file_id" uuid NOT NULL,
	"channel_id" uuid NOT NULL,
	"job_id" uuid,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "imported_files_external_key" UNIQUE("workspace_id","source","channel_id","external_object_id")
);
--> statement-breakpoint
ALTER TABLE "imported_files" ENABLE ROW LEVEL SECURITY;--> statement-breakpoint
CREATE TABLE "imported_message_reactions" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"message_id" uuid NOT NULL,
	"identity_id" uuid NOT NULL,
	"emoji" text NOT NULL,
	"source_key" text NOT NULL,
	"reacted_at" timestamp with time zone NOT NULL,
	CONSTRAINT "imported_message_reactions_unique" UNIQUE("message_id","identity_id","emoji","reacted_at")
);
--> statement-breakpoint
ALTER TABLE "imported_message_reactions" ENABLE ROW LEVEL SECURITY;--> statement-breakpoint
CREATE TABLE "imported_messages" (
	"message_id" uuid PRIMARY KEY NOT NULL,
	"workspace_id" uuid NOT NULL,
	"source" text NOT NULL,
	"external_conversation_id" text NOT NULL,
	"external_message_id" text NOT NULL,
	"identity_id" uuid NOT NULL,
	"job_id" uuid,
	"original_sent_at" timestamp with time zone NOT NULL,
	"original_edited_at" timestamp with time zone,
	"attributes" jsonb DEFAULT '{}'::jsonb NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "imported_messages_external_key" UNIQUE("workspace_id","source","external_conversation_id","external_message_id")
);
--> statement-breakpoint
ALTER TABLE "imported_messages" ENABLE ROW LEVEL SECURITY;--> statement-breakpoint
ALTER TABLE "profiles" DROP CONSTRAINT "profiles_kind_check";--> statement-breakpoint
ALTER TABLE "import_identities" ADD CONSTRAINT "import_identities_workspace_id_workspaces_id_fk" FOREIGN KEY ("workspace_id") REFERENCES "public"."workspaces"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "import_identities" ADD CONSTRAINT "import_identities_linked_user_id_profiles_id_fk" FOREIGN KEY ("linked_user_id") REFERENCES "public"."profiles"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "import_identities" ADD CONSTRAINT "import_identities_linked_by_profiles_id_fk" FOREIGN KEY ("linked_by") REFERENCES "public"."profiles"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "import_job_conversations" ADD CONSTRAINT "import_job_conversations_job_id_import_jobs_id_fk" FOREIGN KEY ("job_id") REFERENCES "public"."import_jobs"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "import_job_conversations" ADD CONSTRAINT "import_job_conversations_channel_id_channels_id_fk" FOREIGN KEY ("channel_id") REFERENCES "public"."channels"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "import_jobs" ADD CONSTRAINT "import_jobs_workspace_id_workspaces_id_fk" FOREIGN KEY ("workspace_id") REFERENCES "public"."workspaces"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "import_jobs" ADD CONSTRAINT "import_jobs_created_by_profiles_id_fk" FOREIGN KEY ("created_by") REFERENCES "public"."profiles"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "imported_files" ADD CONSTRAINT "imported_files_workspace_id_workspaces_id_fk" FOREIGN KEY ("workspace_id") REFERENCES "public"."workspaces"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "imported_files" ADD CONSTRAINT "imported_files_file_id_files_id_fk" FOREIGN KEY ("file_id") REFERENCES "public"."files"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "imported_files" ADD CONSTRAINT "imported_files_channel_id_channels_id_fk" FOREIGN KEY ("channel_id") REFERENCES "public"."channels"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "imported_files" ADD CONSTRAINT "imported_files_job_id_import_jobs_id_fk" FOREIGN KEY ("job_id") REFERENCES "public"."import_jobs"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "imported_message_reactions" ADD CONSTRAINT "imported_message_reactions_message_id_messages_id_fk" FOREIGN KEY ("message_id") REFERENCES "public"."messages"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "imported_message_reactions" ADD CONSTRAINT "imported_message_reactions_identity_id_import_identities_id_fk" FOREIGN KEY ("identity_id") REFERENCES "public"."import_identities"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "imported_messages" ADD CONSTRAINT "imported_messages_message_id_messages_id_fk" FOREIGN KEY ("message_id") REFERENCES "public"."messages"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "imported_messages" ADD CONSTRAINT "imported_messages_workspace_id_workspaces_id_fk" FOREIGN KEY ("workspace_id") REFERENCES "public"."workspaces"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "imported_messages" ADD CONSTRAINT "imported_messages_identity_id_import_identities_id_fk" FOREIGN KEY ("identity_id") REFERENCES "public"."import_identities"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "imported_messages" ADD CONSTRAINT "imported_messages_job_id_import_jobs_id_fk" FOREIGN KEY ("job_id") REFERENCES "public"."import_jobs"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "idx_import_identities_linked_user" ON "import_identities" USING btree ("linked_user_id");--> statement-breakpoint
CREATE INDEX "idx_import_jobs_workspace" ON "import_jobs" USING btree ("workspace_id","created_at");--> statement-breakpoint
CREATE INDEX "idx_imported_files_file" ON "imported_files" USING btree ("file_id");--> statement-breakpoint
CREATE INDEX "idx_imported_message_reactions_message" ON "imported_message_reactions" USING btree ("message_id");--> statement-breakpoint
CREATE INDEX "idx_imported_messages_identity" ON "imported_messages" USING btree ("identity_id");--> statement-breakpoint
ALTER TABLE "profiles" ADD CONSTRAINT "profiles_kind_check" CHECK ("profiles"."kind" in ('human', 'bot', 'import'));--> statement-breakpoint
-- 取り込んだメッセージの送信者にする共通のシステムプロフィール（auth.users を持たず、どのワークスペースのメンバーにもならない）。
-- 本当の投稿者は import_identities に持ち、表示時に上書きする（docs/import-design.md）
INSERT INTO "profiles" ("id", "display_name", "kind")
VALUES ('00000000-0000-4000-8000-00000000c0de', '取り込まれた投稿', 'import')
ON CONFLICT ("id") DO NOTHING;
