-- dismissed / resolved / suppressed のいずれでも、チャットから消えたナッジはベルにも残さない。
CREATE OR REPLACE FUNCTION public.delete_hidden_ai_nudge_notification()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  IF NEW.status IN ('dismissed', 'resolved', 'suppressed')
    AND OLD.status IS DISTINCT FROM NEW.status THEN
    DELETE FROM public.notifications
    WHERE type = 'ai'
      AND data ->> 'nudgeId' = NEW.id::text;
  END IF;
  RETURN NULL;
END;
$$;--> statement-breakpoint
REVOKE ALL ON FUNCTION public.delete_hidden_ai_nudge_notification() FROM PUBLIC;--> statement-breakpoint

DROP TRIGGER IF EXISTS delete_suppressed_ai_nudge_notification ON public.ai_nudges;--> statement-breakpoint
DROP FUNCTION IF EXISTS public.delete_suppressed_ai_nudge_notification();--> statement-breakpoint
DROP TRIGGER IF EXISTS delete_hidden_ai_nudge_notification ON public.ai_nudges;--> statement-breakpoint
CREATE TRIGGER delete_hidden_ai_nudge_notification
AFTER UPDATE OF status ON public.ai_nudges
FOR EACH ROW EXECUTE FUNCTION public.delete_hidden_ai_nudge_notification();
