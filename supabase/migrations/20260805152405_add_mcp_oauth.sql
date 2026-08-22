CREATE TABLE "mcp_oauth_clients" (
	"client_id" text PRIMARY KEY NOT NULL,
	"client_name" text NOT NULL,
	"redirect_uris" jsonb NOT NULL,
	"application_type" text DEFAULT 'web' NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "mcp_oauth_clients_name_not_empty" CHECK (length(trim("mcp_oauth_clients"."client_name")) > 0)
);
--> statement-breakpoint
CREATE TABLE "mcp_oauth_connections" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"client_id" text NOT NULL,
	"user_id" uuid NOT NULL,
	"workspace_id" uuid NOT NULL,
	"scope" "api_token_scope" DEFAULT 'read' NOT NULL,
	"resource" text NOT NULL,
	"revoked_at" timestamp with time zone,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "mcp_oauth_authorization_codes" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"connection_id" uuid NOT NULL,
	"code_hash" text NOT NULL,
	"redirect_uri" text NOT NULL,
	"code_challenge" text NOT NULL,
	"expires_at" timestamp with time zone NOT NULL,
	"used_at" timestamp with time zone,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "mcp_oauth_access_tokens" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"connection_id" uuid NOT NULL,
	"token_hash" text NOT NULL,
	"expires_at" timestamp with time zone NOT NULL,
	"last_used_at" timestamp with time zone,
	"rate_limit_window_started_at" timestamp with time zone DEFAULT now() NOT NULL,
	"rate_limit_count" integer DEFAULT 0 NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "mcp_oauth_access_tokens_rate_limit_nonnegative" CHECK ("mcp_oauth_access_tokens"."rate_limit_count" >= 0),
	CONSTRAINT "mcp_oauth_access_tokens_expires_after_creation" CHECK ("mcp_oauth_access_tokens"."expires_at" > "mcp_oauth_access_tokens"."created_at")
);
--> statement-breakpoint
CREATE TABLE "mcp_oauth_refresh_tokens" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"connection_id" uuid NOT NULL,
	"token_hash" text NOT NULL,
	"expires_at" timestamp with time zone NOT NULL,
	"used_at" timestamp with time zone,
	"revoked_at" timestamp with time zone,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "mcp_oauth_refresh_tokens_expires_after_creation" CHECK ("mcp_oauth_refresh_tokens"."expires_at" > "mcp_oauth_refresh_tokens"."created_at")
);
--> statement-breakpoint
ALTER TABLE "mcp_oauth_connections" ADD CONSTRAINT "mcp_oauth_connections_client_id_fk" FOREIGN KEY ("client_id") REFERENCES "public"."mcp_oauth_clients"("client_id") ON DELETE cascade ON UPDATE no action;
--> statement-breakpoint
ALTER TABLE "mcp_oauth_connections" ADD CONSTRAINT "mcp_oauth_connections_user_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."profiles"("id") ON DELETE cascade ON UPDATE no action;
--> statement-breakpoint
ALTER TABLE "mcp_oauth_connections" ADD CONSTRAINT "mcp_oauth_connections_workspace_id_fk" FOREIGN KEY ("workspace_id") REFERENCES "public"."workspaces"("id") ON DELETE cascade ON UPDATE no action;
--> statement-breakpoint
ALTER TABLE "mcp_oauth_authorization_codes" ADD CONSTRAINT "mcp_oauth_authorization_codes_connection_id_fk" FOREIGN KEY ("connection_id") REFERENCES "public"."mcp_oauth_connections"("id") ON DELETE cascade ON UPDATE no action;
--> statement-breakpoint
ALTER TABLE "mcp_oauth_access_tokens" ADD CONSTRAINT "mcp_oauth_access_tokens_connection_id_fk" FOREIGN KEY ("connection_id") REFERENCES "public"."mcp_oauth_connections"("id") ON DELETE cascade ON UPDATE no action;
--> statement-breakpoint
ALTER TABLE "mcp_oauth_refresh_tokens" ADD CONSTRAINT "mcp_oauth_refresh_tokens_connection_id_fk" FOREIGN KEY ("connection_id") REFERENCES "public"."mcp_oauth_connections"("id") ON DELETE cascade ON UPDATE no action;
--> statement-breakpoint
CREATE INDEX "mcp_oauth_connections_user_workspace_idx" ON "mcp_oauth_connections" USING btree ("user_id", "workspace_id");
--> statement-breakpoint
CREATE UNIQUE INDEX "mcp_oauth_authorization_codes_hash_idx" ON "mcp_oauth_authorization_codes" USING btree ("code_hash");
--> statement-breakpoint
CREATE UNIQUE INDEX "mcp_oauth_access_tokens_hash_idx" ON "mcp_oauth_access_tokens" USING btree ("token_hash");
--> statement-breakpoint
CREATE UNIQUE INDEX "mcp_oauth_refresh_tokens_hash_idx" ON "mcp_oauth_refresh_tokens" USING btree ("token_hash");
--> statement-breakpoint
ALTER TABLE "mcp_oauth_clients" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "mcp_oauth_connections" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "mcp_oauth_authorization_codes" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "mcp_oauth_access_tokens" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "mcp_oauth_refresh_tokens" ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON TABLE "mcp_oauth_clients", "mcp_oauth_connections", "mcp_oauth_authorization_codes", "mcp_oauth_access_tokens", "mcp_oauth_refresh_tokens" FROM anon, authenticated;
