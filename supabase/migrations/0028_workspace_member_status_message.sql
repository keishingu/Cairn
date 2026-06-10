-- ワークスペースメンバーの自由テキストステータスメッセージ（例: 「7月10日〜17日休みます」）
ALTER TABLE workspace_members
  ADD COLUMN status_message text;
