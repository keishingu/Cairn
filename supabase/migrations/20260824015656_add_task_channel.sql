ALTER TABLE "tasks" ADD COLUMN "channel_id" uuid;
--> statement-breakpoint
CREATE OR REPLACE FUNCTION public.set_task_channel_from_source_message()
RETURNS trigger
LANGUAGE plpgsql
SET search_path = public
AS $$
BEGIN
  IF NEW.channel_id IS NULL AND NEW.source_message_id IS NOT NULL THEN
    SELECT channel_id INTO NEW.channel_id
    FROM public.messages
    WHERE id = NEW.source_message_id;
  END IF;
  RETURN NEW;
END;
$$;
--> statement-breakpoint
CREATE TRIGGER set_task_channel_from_source_message
BEFORE INSERT OR UPDATE OF source_message_id ON public.tasks
FOR EACH ROW EXECUTE FUNCTION public.set_task_channel_from_source_message();
--> statement-breakpoint
UPDATE "tasks"
SET "channel_id" = "messages"."channel_id"
FROM "messages"
WHERE "tasks"."source_message_id" = "messages"."id";
--> statement-breakpoint
ALTER TABLE "tasks" ADD CONSTRAINT "tasks_channel_id_channels_id_fk"
  FOREIGN KEY ("channel_id") REFERENCES "public"."channels"("id") ON DELETE cascade ON UPDATE no action;
--> statement-breakpoint
CREATE INDEX "idx_tasks_channel" ON "tasks" USING btree ("channel_id");
--> statement-breakpoint
CREATE OR REPLACE FUNCTION public.can_access_channel(p_channel_id uuid)
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT EXISTS (
    SELECT 1
    FROM channels c
    WHERE c.id = p_channel_id
      AND EXISTS (
        SELECT 1 FROM active_workspace_members wm
        WHERE wm.user_id = auth.uid()
          AND wm.workspace_id = coalesce(
            c.workspace_id,
            (SELECT p.workspace_id FROM projects p WHERE p.id = c.project_id)
          )
          AND (
            wm.role <> 'guest'
            OR c.type = 'dm'
            OR (c.type = 'workspace' AND EXISTS (
              SELECT 1 FROM channel_members cm
              WHERE cm.channel_id = c.id AND cm.user_id = auth.uid()
            ))
            OR (c.type = 'project' AND EXISTS (
              SELECT 1 FROM project_members pm
              WHERE pm.project_id = c.project_id AND pm.user_id = auth.uid()
            ))
          )
      )
      AND (
        ((c.is_private = true OR c.type = 'dm') AND EXISTS (
          SELECT 1 FROM channel_members cm
          WHERE cm.channel_id = c.id AND cm.user_id = auth.uid()
        ))
        OR (c.is_private = false AND c.type IN ('workspace', 'project'))
      )
  );
$$;
