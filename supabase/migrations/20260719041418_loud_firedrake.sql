CREATE INDEX "idx_ai_nudges_message_cooldown" ON "ai_nudges" USING btree ("user_id","detector","message_id","status","remind_after");--> statement-breakpoint
CREATE UNIQUE INDEX "ai_nudges_unanswered_message_unique" ON "ai_nudges" USING btree ("message_id") WHERE "ai_nudges"."detector" = 'unanswered_ask' AND "ai_nudges"."message_id" IS NOT NULL;
