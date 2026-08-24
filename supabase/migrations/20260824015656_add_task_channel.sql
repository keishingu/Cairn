ALTER TABLE "tasks" ADD COLUMN "channel_id" uuid;
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
