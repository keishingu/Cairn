-- メッセージ検索 API の ILIKE '%query%' を高速化するため、pg_trgm の GIN index を追加する。
-- deleted_at IS NULL に限定して、実際の検索条件に近い index にする。

create extension if not exists pg_trgm;

create index if not exists idx_messages_content_trgm
on public.messages
using gin (content gin_trgm_ops)
where deleted_at is null;
