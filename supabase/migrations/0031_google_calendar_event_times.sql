-- Google カレンダー連携: 時刻指定イベントの開始/終了時刻を保存する
ALTER TABLE "google_calendar_events"
  ADD COLUMN "start_time" text,
  ADD COLUMN "end_time" text;
