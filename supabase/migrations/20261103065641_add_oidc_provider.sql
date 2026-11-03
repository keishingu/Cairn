-- 「Cairn でログイン」（OIDC）。Cairn 専用の鍵で署名した ID トークンだけを外部アプリに渡すための
-- クライアント・許可・認可コード・UserInfo 用アクセストークン（docs/oidc-design.md §7）。
-- Route Handlers から Drizzle で読み書きするので、RLS を有効にしてポリシーは書かない
CREATE TABLE "oidc_access_tokens" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"client_id" text NOT NULL,
	"user_id" uuid NOT NULL,
	"scope" text NOT NULL,
	"token_hash" text NOT NULL,
	"expires_at" timestamp with time zone NOT NULL,
	"last_used_at" timestamp with time zone,
	"rate_limit_window_started_at" timestamp with time zone DEFAULT now() NOT NULL,
	"rate_limit_count" integer DEFAULT 0 NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "oidc_access_tokens_rate_limit_nonnegative" CHECK ("oidc_access_tokens"."rate_limit_count" >= 0)
);
--> statement-breakpoint
ALTER TABLE "oidc_access_tokens" ENABLE ROW LEVEL SECURITY;--> statement-breakpoint
CREATE TABLE "oidc_authorization_codes" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"client_id" text NOT NULL,
	"user_id" uuid NOT NULL,
	"code_hash" text NOT NULL,
	"redirect_uri" text NOT NULL,
	"scope" text NOT NULL,
	"nonce" text,
	"code_challenge" text NOT NULL,
	"auth_time" timestamp with time zone NOT NULL,
	"expires_at" timestamp with time zone NOT NULL,
	"used_at" timestamp with time zone,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "oidc_authorization_codes" ENABLE ROW LEVEL SECURITY;--> statement-breakpoint
CREATE TABLE "oidc_clients" (
	"client_id" text PRIMARY KEY NOT NULL,
	"client_name" text NOT NULL,
	"redirect_uris" jsonb NOT NULL,
	"client_type" text NOT NULL,
	"client_secret_hash" text,
	"disabled_at" timestamp with time zone,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "oidc_clients_name_not_empty" CHECK (length(trim("oidc_clients"."client_name")) > 0),
	CONSTRAINT "oidc_clients_type" CHECK ("oidc_clients"."client_type" in ('public', 'confidential')),
	CONSTRAINT "oidc_clients_secret_matches_type" CHECK (("oidc_clients"."client_type" = 'confidential') = ("oidc_clients"."client_secret_hash" is not null))
);
--> statement-breakpoint
ALTER TABLE "oidc_clients" ENABLE ROW LEVEL SECURITY;--> statement-breakpoint
CREATE TABLE "oidc_grants" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"client_id" text NOT NULL,
	"user_id" uuid NOT NULL,
	"scope" text NOT NULL,
	"granted_at" timestamp with time zone DEFAULT now() NOT NULL,
	"revoked_at" timestamp with time zone
);
--> statement-breakpoint
ALTER TABLE "oidc_grants" ENABLE ROW LEVEL SECURITY;--> statement-breakpoint
ALTER TABLE "oidc_access_tokens" ADD CONSTRAINT "oidc_access_tokens_client_id_oidc_clients_client_id_fk" FOREIGN KEY ("client_id") REFERENCES "public"."oidc_clients"("client_id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "oidc_access_tokens" ADD CONSTRAINT "oidc_access_tokens_user_id_profiles_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."profiles"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "oidc_authorization_codes" ADD CONSTRAINT "oidc_authorization_codes_client_id_oidc_clients_client_id_fk" FOREIGN KEY ("client_id") REFERENCES "public"."oidc_clients"("client_id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "oidc_authorization_codes" ADD CONSTRAINT "oidc_authorization_codes_user_id_profiles_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."profiles"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "oidc_grants" ADD CONSTRAINT "oidc_grants_client_id_oidc_clients_client_id_fk" FOREIGN KEY ("client_id") REFERENCES "public"."oidc_clients"("client_id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "oidc_grants" ADD CONSTRAINT "oidc_grants_user_id_profiles_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."profiles"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE UNIQUE INDEX "oidc_access_tokens_hash_idx" ON "oidc_access_tokens" USING btree ("token_hash");--> statement-breakpoint
CREATE UNIQUE INDEX "oidc_authorization_codes_hash_idx" ON "oidc_authorization_codes" USING btree ("code_hash");--> statement-breakpoint
CREATE UNIQUE INDEX "oidc_grants_active_idx" ON "oidc_grants" USING btree ("client_id","user_id") WHERE "oidc_grants"."revoked_at" is null;--> statement-breakpoint
CREATE INDEX "oidc_grants_user_idx" ON "oidc_grants" USING btree ("user_id");