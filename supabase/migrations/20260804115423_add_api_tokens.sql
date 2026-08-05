CREATE TYPE "public"."api_token_scope" AS ENUM('read', 'write');--> statement-breakpoint
CREATE TABLE "api_tokens" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"user_id" uuid NOT NULL,
	"workspace_id" uuid NOT NULL,
	"name" text NOT NULL,
	"token_hash" text NOT NULL,
	"token_prefix" text NOT NULL,
	"scope" "api_token_scope" DEFAULT 'read' NOT NULL,
	"expires_at" timestamp with time zone NOT NULL,
	"revoked_at" timestamp with time zone,
	"last_used_at" timestamp with time zone,
	"rate_limit_window_started_at" timestamp with time zone DEFAULT now() NOT NULL,
	"rate_limit_count" integer DEFAULT 0 NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "api_tokens_name_not_empty" CHECK (length(trim("api_tokens"."name")) > 0),
	CONSTRAINT "api_tokens_rate_limit_count_nonnegative" CHECK ("api_tokens"."rate_limit_count" >= 0),
	CONSTRAINT "api_tokens_expires_after_creation" CHECK ("api_tokens"."expires_at" > "api_tokens"."created_at"),
	CONSTRAINT "api_tokens_maximum_lifetime" CHECK ("api_tokens"."expires_at" <= "api_tokens"."created_at" + interval '1 year')
);
--> statement-breakpoint
ALTER TABLE "api_tokens" ADD CONSTRAINT "api_tokens_user_id_profiles_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."profiles"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "api_tokens" ADD CONSTRAINT "api_tokens_workspace_id_workspaces_id_fk" FOREIGN KEY ("workspace_id") REFERENCES "public"."workspaces"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE UNIQUE INDEX "api_tokens_token_hash_idx" ON "api_tokens" USING btree ("token_hash");--> statement-breakpoint
CREATE INDEX "api_tokens_user_workspace_idx" ON "api_tokens" USING btree ("user_id","workspace_id");--> statement-breakpoint
ALTER TABLE "api_tokens" ENABLE ROW LEVEL SECURITY;--> statement-breakpoint
REVOKE ALL ON TABLE "api_tokens" FROM anon, authenticated;
