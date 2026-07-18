-- タスクの条件変更・完了・削除の入口に依存せず、対応するAIナッジとベル通知を即時解消する。
-- BEFORE DELETEで実行し、ai_nudges.task_idのON DELETE SET NULLより先に対象を特定する。
CREATE OR REPLACE FUNCTION public.resolve_ai_nudges_on_task_lifecycle()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  IF TG_OP = 'DELETE' THEN
    UPDATE public.ai_nudges
    SET status = 'resolved', remind_after = NULL
    WHERE task_id = OLD.id
      AND status = 'active';
    RETURN OLD;
  END IF;

  IF NEW.status = 'done' AND OLD.status IS DISTINCT FROM NEW.status THEN
    UPDATE public.ai_nudges
    SET status = 'resolved', remind_after = NULL
    WHERE task_id = NEW.id
      AND status = 'active';
  ELSE
    UPDATE public.ai_nudges
    SET status = 'resolved', remind_after = NULL
    WHERE task_id = NEW.id
      AND status = 'active'
      AND (
        (detector IN ('task_due_soon', 'task_overdue') AND OLD.due_date IS DISTINCT FROM NEW.due_date)
        OR (detector = 'task_due_soon' AND OLD.status IS DISTINCT FROM NEW.status)
        OR (detector = 'task_stalled' AND OLD.updated_at IS DISTINCT FROM NEW.updated_at)
      );
  END IF;
  RETURN NEW;
END;
$$;--> statement-breakpoint
REVOKE ALL ON FUNCTION public.resolve_ai_nudges_on_task_lifecycle() FROM PUBLIC;--> statement-breakpoint

DROP TRIGGER IF EXISTS resolve_ai_nudges_before_task_done ON public.tasks;--> statement-breakpoint
DROP TRIGGER IF EXISTS resolve_ai_nudges_before_task_change ON public.tasks;--> statement-breakpoint
CREATE TRIGGER resolve_ai_nudges_before_task_change
BEFORE UPDATE OF status, due_date, updated_at ON public.tasks
FOR EACH ROW EXECUTE FUNCTION public.resolve_ai_nudges_on_task_lifecycle();--> statement-breakpoint

DROP TRIGGER IF EXISTS resolve_ai_nudges_before_task_delete ON public.tasks;--> statement-breakpoint
CREATE TRIGGER resolve_ai_nudges_before_task_delete
BEFORE DELETE ON public.tasks
FOR EACH ROW EXECUTE FUNCTION public.resolve_ai_nudges_on_task_lifecycle();--> statement-breakpoint

-- projectのアーカイブ時は検知対象外になるため即時解消する。CASCADE削除時は、
-- 子taskのDELETE時点で親FKが参照できないため、親の削除前に解消する。
CREATE OR REPLACE FUNCTION public.resolve_ai_nudges_on_project_lifecycle()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  IF TG_OP = 'DELETE' THEN
    UPDATE public.ai_nudges
    SET status = 'resolved', remind_after = NULL
    WHERE project_id = OLD.id
      AND status = 'active';
    RETURN OLD;
  END IF;

  IF NEW.archived = true AND OLD.archived IS DISTINCT FROM NEW.archived THEN
    UPDATE public.ai_nudges
    SET status = 'resolved', remind_after = NULL
    WHERE project_id = NEW.id
      AND status = 'active';
  END IF;
  RETURN NEW;
END;
$$;--> statement-breakpoint
REVOKE ALL ON FUNCTION public.resolve_ai_nudges_on_project_lifecycle() FROM PUBLIC;--> statement-breakpoint

DROP TRIGGER IF EXISTS resolve_ai_nudges_before_project_delete ON public.projects;--> statement-breakpoint
DROP TRIGGER IF EXISTS resolve_ai_nudges_before_project_archive ON public.projects;--> statement-breakpoint
DROP FUNCTION IF EXISTS public.resolve_ai_nudges_before_project_delete();--> statement-breakpoint
CREATE TRIGGER resolve_ai_nudges_before_project_delete
BEFORE DELETE ON public.projects
FOR EACH ROW EXECUTE FUNCTION public.resolve_ai_nudges_on_project_lifecycle();--> statement-breakpoint
CREATE TRIGGER resolve_ai_nudges_before_project_archive
BEFORE UPDATE OF archived ON public.projects
FOR EACH ROW EXECUTE FUNCTION public.resolve_ai_nudges_on_project_lifecycle();
