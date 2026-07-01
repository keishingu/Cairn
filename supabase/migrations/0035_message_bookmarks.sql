-- メッセージの個人ブックマーク（チーム共通のピン留めではなく、各ユーザーが「後で見返す」ための保存）
CREATE TABLE message_bookmarks (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  message_id uuid NOT NULL REFERENCES messages(id) ON DELETE CASCADE,
  user_id uuid NOT NULL REFERENCES profiles(id) ON DELETE CASCADE,
  created_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (message_id, user_id)
);

CREATE INDEX idx_message_bookmarks_user ON message_bookmarks (user_id, created_at);
