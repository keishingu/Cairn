-- 削除されたメッセージのメンション・DM 通知を既読にし、チャンネルの未読メンション数を数え直す。
--
-- これまでは削除しても通知と channel_read_states.unread_mention_count が残り、
-- 削除でチャンネルが空になると既読 API も呼ばれないため、一覧のバッジが消えなくなっていた。
-- 削除の経路（本人の削除・通報対応・アプリの API・プロジェクト更新の差し替え）が複数あるため、
-- トリガーでまとめて扱う。
--
-- 通知を作る Inngest ジョブはメッセージ行を FOR SHARE でロックしてから通知を作るため、
-- 削除の UPDATE とは直列になる。ジョブが先なら、このトリガーが作られた通知を既読にする。
-- 削除が先なら、ジョブ側が削除済みを見て通知を既読で作る。

CREATE OR REPLACE FUNCTION public.settle_notifications_for_deleted_message()
RETURNS trigger
LANGUAGE plpgsql
SET search_path = public
AS $$
BEGIN
  WITH settled AS (
    UPDATE notifications n
    SET read_at = now()
    WHERE n.data->>'messageId' = NEW.id::text
      AND n.type IN ('mention', 'dm')
      AND n.read_at IS NULL
    RETURNING n.user_id, n.data->>'channelId' AS channel_id
  )
  UPDATE channel_read_states crs
  SET unread_mention_count = (
        SELECT count(*)::integer
        FROM notifications n
        WHERE n.user_id = crs.user_id
          AND n.type = 'mention'
          AND n.read_at IS NULL
          AND n.data->>'channelId' = crs.channel_id::text
          AND n.data->>'messageId' <> NEW.id::text
      ),
      updated_at = now()
  FROM (SELECT DISTINCT user_id, channel_id FROM settled) s
  WHERE crs.user_id = s.user_id
    AND crs.channel_id::text = s.channel_id;

  RETURN NULL;
END;
$$;

REVOKE ALL ON FUNCTION public.settle_notifications_for_deleted_message() FROM PUBLIC;

DROP TRIGGER IF EXISTS settle_notifications_on_message_delete ON public.messages;
CREATE TRIGGER settle_notifications_on_message_delete
AFTER UPDATE OF deleted_at ON public.messages
FOR EACH ROW
WHEN (OLD.deleted_at IS NULL AND NEW.deleted_at IS NOT NULL)
EXECUTE FUNCTION public.settle_notifications_for_deleted_message();

-- 既に削除されたメッセージの通知と、それで数がずれたチャンネルの未読メンション数を直す。
DO $$
BEGIN
  CREATE TEMP TABLE settled_pairs ON COMMIT DROP AS
  SELECT DISTINCT n.user_id, n.data->>'channelId' AS channel_id
  FROM notifications n
  JOIN messages m ON m.id::text = n.data->>'messageId'
  WHERE n.type IN ('mention', 'dm')
    AND m.deleted_at IS NOT NULL;

  UPDATE notifications n
  SET read_at = now()
  FROM messages m
  WHERE m.id::text = n.data->>'messageId'
    AND m.deleted_at IS NOT NULL
    AND n.type IN ('mention', 'dm')
    AND n.read_at IS NULL;

  UPDATE channel_read_states crs
  SET unread_mention_count = (
        SELECT count(*)::integer
        FROM notifications n
        WHERE n.user_id = crs.user_id
          AND n.type = 'mention'
          AND n.read_at IS NULL
          AND n.data->>'channelId' = crs.channel_id::text
      ),
      updated_at = now()
  FROM settled_pairs s
  WHERE crs.user_id = s.user_id
    AND crs.channel_id::text = s.channel_id;
END;
$$;
