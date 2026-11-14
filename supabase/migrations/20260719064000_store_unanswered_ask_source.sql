-- 高トラフィックのチャンネルでも成熟待ちの未回答依頼を特定できるよう、
-- 次回再評価の根拠メッセージを予約時刻と対で保持する。
alter table public.ai_scan_states
  add column next_unanswered_ask_message_id uuid
  references public.messages(id) on delete set null;

-- 旧バージョンが保存した予約は根拠を一意に復元できないため無効化する。
-- 次の通常巡回でメッセージID付きの予約として作り直される。
update public.ai_scan_states
set next_unanswered_ask_check_at = null
where next_unanswered_ask_check_at is not null;
