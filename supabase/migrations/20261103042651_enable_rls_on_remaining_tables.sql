-- 「Cairn でログイン」（OIDC）で外部アプリに発行されるトークンは通常ログインと同じ authenticated の JWT になるため、
-- RLS が無効だった public のテーブルをすべて有効にする（docs/oidc-design.md §5）。ポリシーは書かないので、
-- anon / authenticated からは0行しか見えない。postgres（Drizzle）と service_role は RLS を無視するため、
-- サーバーの読み書きは変わらない。本番は anon / authenticated にテーブル権限がなく、これは二重の守りになる。
ALTER TABLE "profiles" ENABLE ROW LEVEL SECURITY;--> statement-breakpoint
ALTER TABLE "project_statuses" ENABLE ROW LEVEL SECURITY;--> statement-breakpoint
ALTER TABLE "tags" ENABLE ROW LEVEL SECURITY;--> statement-breakpoint
ALTER TABLE "workspace_invites" ENABLE ROW LEVEL SECURITY;--> statement-breakpoint
ALTER TABLE "workspace_members" ENABLE ROW LEVEL SECURITY;--> statement-breakpoint
ALTER TABLE "workspaces" ENABLE ROW LEVEL SECURITY;--> statement-breakpoint
ALTER TABLE "member_experiences" ENABLE ROW LEVEL SECURITY;--> statement-breakpoint
ALTER TABLE "pinned_projects" ENABLE ROW LEVEL SECURITY;--> statement-breakpoint
ALTER TABLE "project_members" ENABLE ROW LEVEL SECURITY;--> statement-breakpoint
ALTER TABLE "project_tags" ENABLE ROW LEVEL SECURITY;--> statement-breakpoint
ALTER TABLE "projects" ENABLE ROW LEVEL SECURITY;--> statement-breakpoint
ALTER TABLE "milestones" ENABLE ROW LEVEL SECURITY;--> statement-breakpoint
ALTER TABLE "channel_members" ENABLE ROW LEVEL SECURITY;--> statement-breakpoint
ALTER TABLE "channels" ENABLE ROW LEVEL SECURITY;--> statement-breakpoint
ALTER TABLE "message_attachments" ENABLE ROW LEVEL SECURITY;--> statement-breakpoint
ALTER TABLE "message_bookmarks" ENABLE ROW LEVEL SECURITY;--> statement-breakpoint
ALTER TABLE "files" ENABLE ROW LEVEL SECURITY;--> statement-breakpoint
ALTER TABLE "tasks" ENABLE ROW LEVEL SECURITY;--> statement-breakpoint
ALTER TABLE "gallery_comments" ENABLE ROW LEVEL SECURITY;--> statement-breakpoint
ALTER TABLE "gallery_items" ENABLE ROW LEVEL SECURITY;--> statement-breakpoint
ALTER TABLE "gallery_likes" ENABLE ROW LEVEL SECURITY;--> statement-breakpoint
ALTER TABLE "ai_agents" ENABLE ROW LEVEL SECURITY;--> statement-breakpoint
ALTER TABLE "ai_conversations" ENABLE ROW LEVEL SECURITY;--> statement-breakpoint
ALTER TABLE "ai_messages" ENABLE ROW LEVEL SECURITY;--> statement-breakpoint
ALTER TABLE "audit_logs" ENABLE ROW LEVEL SECURITY;--> statement-breakpoint
ALTER TABLE "connected_accounts" ENABLE ROW LEVEL SECURITY;--> statement-breakpoint
ALTER TABLE "external_events" ENABLE ROW LEVEL SECURITY;--> statement-breakpoint
ALTER TABLE "external_integrations" ENABLE ROW LEVEL SECURITY;--> statement-breakpoint
ALTER TABLE "google_calendar_events" ENABLE ROW LEVEL SECURITY;--> statement-breakpoint
ALTER TABLE "document_chunks" ENABLE ROW LEVEL SECURITY;--> statement-breakpoint
ALTER TABLE "push_subscriptions" ENABLE ROW LEVEL SECURITY;--> statement-breakpoint
ALTER TABLE "workspace_storage_usage" ENABLE ROW LEVEL SECURITY;--> statement-breakpoint
ALTER TABLE "upload_requests" ENABLE ROW LEVEL SECURITY;--> statement-breakpoint
