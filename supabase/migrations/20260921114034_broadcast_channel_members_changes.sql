-- 非公開チャンネルの一覧は channel_members が正。参加行の副作用（既読 INSERT）に頼ると、
-- 以前開いて既読行がある人を後から追加したときに user トピックへ何も届かない。
CREATE OR REPLACE FUNCTION public.broadcast_channel_members_changes()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  PERFORM realtime.broadcast_changes(
    'user:' || COALESCE(NEW.user_id, OLD.user_id)::text,
    TG_OP,
    TG_OP,
    TG_TABLE_NAME,
    TG_TABLE_SCHEMA,
    NULL::public.channel_members,
    NULL::public.channel_members
  );
  RETURN NULL;
END;
$$;

REVOKE ALL ON FUNCTION public.broadcast_channel_members_changes() FROM PUBLIC;

CREATE TRIGGER broadcast_channel_members_changes
AFTER INSERT OR DELETE ON public.channel_members
FOR EACH ROW EXECUTE FUNCTION public.broadcast_channel_members_changes();
