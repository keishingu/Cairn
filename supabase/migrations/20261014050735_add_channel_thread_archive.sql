ALTER TABLE "channels" ADD COLUMN "archived_at" timestamp with time zone;
--> statement-breakpoint
-- スレッドのアーカイブ・解除も、名称変更と同じく開いている本人以外の一覧へ届ける。
CREATE OR REPLACE FUNCTION public.broadcast_workspace_channel_changes()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  channel_row public.channels%ROWTYPE;
  recipient uuid;
BEGIN
  channel_row := CASE WHEN TG_OP = 'DELETE' THEN OLD ELSE NEW END;

  IF channel_row.type IS DISTINCT FROM 'workspace' OR channel_row.workspace_id IS NULL THEN
    RETURN NULL;
  END IF;

  IF TG_OP = 'UPDATE'
    AND NEW.name IS NOT DISTINCT FROM OLD.name
    AND NEW.archived_at IS NOT DISTINCT FROM OLD.archived_at THEN
    RETURN NULL;
  END IF;

  FOR recipient IN
    SELECT awm.user_id
    FROM public.active_workspace_members awm
    WHERE awm.workspace_id = channel_row.workspace_id
  LOOP
    PERFORM realtime.broadcast_changes(
      'user:' || recipient::text,
      TG_OP,
      TG_OP,
      TG_TABLE_NAME,
      TG_TABLE_SCHEMA,
      NULL::public.channels,
      NULL::public.channels
    );
  END LOOP;

  RETURN NULL;
END;
$$;
--> statement-breakpoint
REVOKE ALL ON FUNCTION public.broadcast_workspace_channel_changes() FROM PUBLIC;
