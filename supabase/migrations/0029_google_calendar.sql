-- Google カレンダー連携: 取り込んだイベントのキャッシュテーブル
CREATE TABLE "google_calendar_events" (
  "id"                  uuid        PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
  "user_id"             uuid        NOT NULL REFERENCES "profiles"("id")   ON DELETE CASCADE,
  "workspace_id"        uuid        NOT NULL REFERENCES "workspaces"("id") ON DELETE CASCADE,
  "google_calendar_id"  text        NOT NULL,
  "google_event_id"     text        NOT NULL,
  "title"               text        NOT NULL,
  "start_date"          text,
  "end_date"            text,
  "is_all_day"          boolean     NOT NULL DEFAULT false,
  "description"         text,
  "calendar_name"       text,
  "calendar_color"      text,
  "html_link"           text,
  "synced_at"           timestamptz NOT NULL DEFAULT now()
);

-- ユーザー × カレンダー × イベント の組み合わせを一意にして upsert を可能にする
CREATE UNIQUE INDEX "google_calendar_events_user_cal_event_idx"
  ON "google_calendar_events" ("user_id", "google_calendar_id", "google_event_id");
