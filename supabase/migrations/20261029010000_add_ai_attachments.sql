-- AIアシスタントの会話への添付（docs/10_ai_member_design.md「会話への添付」）。
-- サーバー（直接接続）からのみ読み書きする。表を作ってから RLS・REVOKE までの間に authenticated から書き込まれないよう、
-- 1つの DO ブロックで同時に作る（Supabase CLI は文ごとにトランザクションなしで流す。新しい表は既定で anon・authenticated に権限が付く）
DO $$
BEGIN
  CREATE TABLE "ai_attachments" (
  	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
  	"workspace_id" uuid NOT NULL,
  	"conversation_id" uuid NOT NULL,
  	"message_id" uuid,
  	"uploaded_by" uuid NOT NULL,
  	"file_name" text NOT NULL,
  	"mime_type" text NOT NULL,
  	"file_size" integer NOT NULL,
  	"storage_path" text NOT NULL,
  	"extracted_text" text,
  	"text_truncated" boolean DEFAULT false NOT NULL,
  	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
  	CONSTRAINT "ai_attachments_file_size_positive" CHECK ("ai_attachments"."file_size" > 0)
  );

  ALTER TABLE "ai_attachments" ADD CONSTRAINT "ai_attachments_workspace_id_workspaces_id_fk" FOREIGN KEY ("workspace_id") REFERENCES "public"."workspaces"("id") ON DELETE cascade ON UPDATE no action;
  ALTER TABLE "ai_attachments" ADD CONSTRAINT "ai_attachments_conversation_id_ai_conversations_id_fk" FOREIGN KEY ("conversation_id") REFERENCES "public"."ai_conversations"("id") ON DELETE cascade ON UPDATE no action;
  ALTER TABLE "ai_attachments" ADD CONSTRAINT "ai_attachments_message_id_ai_messages_id_fk" FOREIGN KEY ("message_id") REFERENCES "public"."ai_messages"("id") ON DELETE cascade ON UPDATE no action;
  ALTER TABLE "ai_attachments" ADD CONSTRAINT "ai_attachments_uploaded_by_profiles_id_fk" FOREIGN KEY ("uploaded_by") REFERENCES "public"."profiles"("id") ON DELETE cascade ON UPDATE no action;
  CREATE INDEX "idx_ai_attachments_conversation" ON "ai_attachments" USING btree ("conversation_id");
  CREATE INDEX "idx_ai_attachments_message" ON "ai_attachments" USING btree ("message_id");
  CREATE INDEX "idx_ai_attachments_unsent" ON "ai_attachments" USING btree ("created_at") WHERE "ai_attachments"."message_id" is null;
  ALTER TABLE "ai_attachments" ENABLE ROW LEVEL SECURITY;
  REVOKE ALL ON TABLE "ai_attachments" FROM anon, authenticated;
END
$$;

-- 本体は非公開バケットに置く。アップロードはサーバーが発行した署名付き URL だけで受け付け、
-- 読み出しもサーバー（service role）か、サーバーが発行した期限付きの署名付き URL だけにする（storage.objects のポリシーは作らない）
INSERT INTO storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
VALUES (
  'ai-attachments',
  'ai-attachments',
  false,
  10485760,
  ARRAY[
    'image/jpeg', 'image/png', 'image/gif', 'image/webp',
    'application/pdf',
    'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
    'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
    'application/vnd.openxmlformats-officedocument.presentationml.presentation',
    'text/plain', 'text/markdown', 'text/csv'
  ]
)
ON CONFLICT (id) DO NOTHING;
