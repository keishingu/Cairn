-- /ai（AIチャット）を使えるロールの範囲。owner が「オーナーのみ（owner）/ 管理者以上（admin）/ メンバーも可（member）」から選ぶ。
-- member はゲストも含む全員で、既定にすることで既存ワークスペースの挙動を変えない。旧コードはこの列を読まないため後方互換。
-- 値の集合は @cairn/shared の AI_CHAT_ACCESS_LEVELS と同じ。1 文で列と CHECK 制約を追加し、中途半端な状態を残さない。
ALTER TABLE "workspaces"
  ADD COLUMN "ai_chat_access" text NOT NULL DEFAULT 'member',
  ADD CONSTRAINT "workspaces_ai_chat_access_check" CHECK ("ai_chat_access" IN ('owner', 'admin', 'member'));
