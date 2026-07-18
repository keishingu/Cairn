-- user topicの購読者はtable名だけでREST再取得するため、本文を含む行全体はbroadcastしない。
CREATE OR REPLACE FUNCTION public.broadcast_ai_nudges_changes()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  PERFORM realtime.broadcast_changes(
    'user:' || NEW.user_id::text,
    TG_OP,
    TG_OP,
    TG_TABLE_NAME,
    TG_TABLE_SCHEMA,
    NULL::public.ai_nudges,
    NULL::public.ai_nudges
  );
  RETURN NULL;
END;
$$;--> statement-breakpoint
REVOKE ALL ON FUNCTION public.broadcast_ai_nudges_changes() FROM PUBLIC;--> statement-breakpoint

CREATE OR REPLACE FUNCTION public.broadcast_notifications_changes()
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
    NULL::public.notifications,
    NULL::public.notifications
  );
  RETURN NULL;
END;
$$;--> statement-breakpoint
REVOKE ALL ON FUNCTION public.broadcast_notifications_changes() FROM PUBLIC;
