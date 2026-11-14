-- 投票カードを描いている処理のリース。投票の応答後にその場でカードを描き直す（Inngest の待ち行列を通さない）ため、
-- Inngest の拾い直しと同時に描いて古い集計が後勝ちしないよう、投票ごとに描く処理を1本にする。
-- どちらも null 可の追加で、旧コードはこの列を読まないため後方互換。
ALTER TABLE "polls"
  ADD COLUMN "render_lease_token" uuid,
  ADD COLUMN "render_lease_until" timestamp with time zone;
