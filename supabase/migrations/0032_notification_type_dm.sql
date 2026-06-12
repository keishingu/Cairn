-- DM のインボックス通知を表現するため notification_type に 'dm' を追加する。
-- 既存の Push のみだった DM 通知を、アプリ内通知（ベル）でも回収できるようにする。
ALTER TYPE "public"."notification_type" ADD VALUE IF NOT EXISTS 'dm';
