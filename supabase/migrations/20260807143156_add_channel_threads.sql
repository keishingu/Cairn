ALTER TABLE "channels" ADD COLUMN "parent_channel_id" uuid;
--> statement-breakpoint
ALTER TABLE "channels" ADD CONSTRAINT "channels_parent_channel_id_channels_id_fk" FOREIGN KEY ("parent_channel_id") REFERENCES "public"."channels"("id") ON DELETE cascade ON UPDATE no action;
--> statement-breakpoint
CREATE INDEX "idx_channels_parent" ON "channels" USING btree ("parent_channel_id");
--> statement-breakpoint
ALTER TABLE "channels" ADD CONSTRAINT "channels_parent_not_self" CHECK ("channels"."parent_channel_id" is null or "channels"."parent_channel_id" <> "channels"."id");
