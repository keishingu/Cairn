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
