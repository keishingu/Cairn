ALTER TYPE "public"."message_type" ADD VALUE IF NOT EXISTS 'poll';

CREATE TABLE "polls" (
  "id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
  "workspace_id" uuid NOT NULL REFERENCES "workspaces"("id") ON DELETE cascade,
  "channel_id" uuid NOT NULL REFERENCES "channels"("id") ON DELETE cascade,
  "message_id" uuid NOT NULL REFERENCES "messages"("id") ON DELETE cascade,
  "created_by" uuid NOT NULL REFERENCES "profiles"("id"),
  "question" text NOT NULL,
  "allow_multiple" boolean DEFAULT false NOT NULL,
  "anonymous" boolean DEFAULT false NOT NULL,
  "closes_at" timestamp with time zone,
  "created_at" timestamp with time zone DEFAULT now() NOT NULL,
  CONSTRAINT "polls_message_id_unique" UNIQUE("message_id")
);

CREATE TABLE "poll_options" (
  "id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
  "poll_id" uuid NOT NULL REFERENCES "polls"("id") ON DELETE cascade,
  "label" text NOT NULL,
  "position" integer NOT NULL,
  CONSTRAINT "poll_options_poll_id_position_unique" UNIQUE("poll_id","position")
);

CREATE TABLE "poll_votes" (
  "id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
  "poll_id" uuid NOT NULL REFERENCES "polls"("id") ON DELETE cascade,
  "option_id" uuid NOT NULL REFERENCES "poll_options"("id") ON DELETE cascade,
  "user_id" uuid NOT NULL REFERENCES "profiles"("id") ON DELETE cascade,
  "allow_multiple" boolean DEFAULT false NOT NULL,
  "created_at" timestamp with time zone DEFAULT now() NOT NULL,
  CONSTRAINT "poll_votes_poll_id_option_id_user_id_unique" UNIQUE("poll_id","option_id","user_id")
);

CREATE INDEX "idx_polls_workspace" ON "polls" ("workspace_id","created_at");
CREATE INDEX "idx_polls_channel" ON "polls" ("channel_id","created_at");
CREATE INDEX "idx_poll_options_poll" ON "poll_options" ("poll_id","position");
CREATE INDEX "idx_poll_votes_poll" ON "poll_votes" ("poll_id","created_at");
CREATE INDEX "idx_poll_votes_option" ON "poll_votes" ("option_id","created_at");
CREATE UNIQUE INDEX "idx_poll_votes_single_choice_user"
  ON "poll_votes" ("poll_id","user_id")
  WHERE "allow_multiple" = false;
