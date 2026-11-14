CREATE TABLE "ai_scan_states" (
	"channel_id" uuid PRIMARY KEY NOT NULL,
	"last_scanned_message_id" uuid,
	"last_scanned_at" timestamp with time zone NOT NULL
);
--> statement-breakpoint
ALTER TABLE "ai_scan_states" ADD CONSTRAINT "ai_scan_states_channel_id_channels_id_fk" FOREIGN KEY ("channel_id") REFERENCES "public"."channels"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "ai_scan_states" ADD CONSTRAINT "ai_scan_states_last_scanned_message_id_messages_id_fk" FOREIGN KEY ("last_scanned_message_id") REFERENCES "public"."messages"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint

-- 巡回カーソルはサーバー内部状態であり、Data API からクライアントへ公開しない。
ALTER TABLE public.ai_scan_states ENABLE ROW LEVEL SECURITY;--> statement-breakpoint
REVOKE ALL ON TABLE public.ai_scan_states FROM anon, authenticated;
