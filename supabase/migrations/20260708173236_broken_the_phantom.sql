ALTER TYPE "public"."message_type" ADD VALUE 'poll';--> statement-breakpoint

CREATE TABLE "polls" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"channel_id" uuid NOT NULL,
	"message_id" uuid NOT NULL,
	"question" text NOT NULL,
	"allow_multiple" boolean DEFAULT false NOT NULL,
	"anonymous" boolean DEFAULT false NOT NULL,
	"created_by" uuid NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "polls_message_id_unique" UNIQUE("message_id")
);
--> statement-breakpoint
CREATE TABLE "poll_options" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"poll_id" uuid NOT NULL,
	"text" text NOT NULL,
	"display_order" integer NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "poll_options_poll_id_display_order_unique" UNIQUE("poll_id","display_order")
);
--> statement-breakpoint
CREATE TABLE "poll_votes" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"poll_id" uuid NOT NULL,
	"option_id" uuid NOT NULL,
	"user_id" uuid NOT NULL,
	"allow_multiple" boolean NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "poll_votes_poll_id_option_id_user_id_unique" UNIQUE("poll_id","option_id","user_id")
);
--> statement-breakpoint
ALTER TABLE "polls" ADD CONSTRAINT "polls_channel_id_channels_id_fk" FOREIGN KEY ("channel_id") REFERENCES "public"."channels"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "polls" ADD CONSTRAINT "polls_message_id_messages_id_fk" FOREIGN KEY ("message_id") REFERENCES "public"."messages"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "polls" ADD CONSTRAINT "polls_created_by_profiles_id_fk" FOREIGN KEY ("created_by") REFERENCES "public"."profiles"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "poll_options" ADD CONSTRAINT "poll_options_poll_id_polls_id_fk" FOREIGN KEY ("poll_id") REFERENCES "public"."polls"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "poll_votes" ADD CONSTRAINT "poll_votes_poll_id_polls_id_fk" FOREIGN KEY ("poll_id") REFERENCES "public"."polls"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "poll_votes" ADD CONSTRAINT "poll_votes_option_id_poll_options_id_fk" FOREIGN KEY ("option_id") REFERENCES "public"."poll_options"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "poll_votes" ADD CONSTRAINT "poll_votes_user_id_profiles_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."profiles"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "idx_polls_channel" ON "polls" USING btree ("channel_id","created_at");--> statement-breakpoint
CREATE INDEX "idx_poll_options_poll" ON "poll_options" USING btree ("poll_id","display_order");--> statement-breakpoint
CREATE INDEX "idx_poll_votes_poll" ON "poll_votes" USING btree ("poll_id");--> statement-breakpoint
CREATE INDEX "idx_poll_votes_option" ON "poll_votes" USING btree ("option_id");--> statement-breakpoint
CREATE UNIQUE INDEX "idx_poll_votes_single_choice" ON "poll_votes" USING btree ("poll_id","user_id") WHERE "poll_votes"."allow_multiple" = false;--> statement-breakpoint

ALTER TABLE "polls" ENABLE ROW LEVEL SECURITY;--> statement-breakpoint
ALTER TABLE "poll_options" ENABLE ROW LEVEL SECURITY;--> statement-breakpoint
ALTER TABLE "poll_votes" ENABLE ROW LEVEL SECURITY;--> statement-breakpoint

CREATE POLICY "polls_select" ON "polls"
  FOR SELECT TO authenticated
  USING (public.can_access_channel(channel_id));--> statement-breakpoint

CREATE POLICY "poll_options_select" ON "poll_options"
  FOR SELECT TO authenticated
  USING (
    EXISTS (
      SELECT 1
      FROM "polls"
      WHERE "polls"."id" = "poll_options"."poll_id"
        AND public.can_access_channel("polls"."channel_id")
    )
  );--> statement-breakpoint

CREATE POLICY "poll_votes_select" ON "poll_votes"
  FOR SELECT TO authenticated
  USING (
    EXISTS (
      SELECT 1
      FROM "polls"
      WHERE "polls"."id" = "poll_votes"."poll_id"
        AND public.can_access_channel("polls"."channel_id")
    )
  );
