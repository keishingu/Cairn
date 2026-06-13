-- postgres_changes から Broadcast from Database への移行。
--
-- 背景: 本プロジェクトの Realtime サーバーは postgres_changes の購読要求を処理しない
-- （join 応答に postgres_changes の確認が含まれず realtime.subscription にも登録されない。
--   Realtime ログでも Broadcast 用レプリケーションのみ起動）。
-- Supabase の推奨方式である realtime.broadcast_changes() + トリガーに移行する。
--
-- トピック設計:
--   channel:{channel_id} … messages / message_reactions の変更（チャンネル単位）
--   user:{user_id}       … notifications / channel_read_states の変更（ユーザー単位）
-- いずれも private channel として購読し、realtime.messages への RLS で join を認可する。

-- ─── トピック認可ヘルパー ────────────────────────────────────────
-- 'channel:<uuid>' 形式のトピックを安全にパースし、can_access_channel で判定する
create or replace function public.can_access_channel_topic(p_topic text)
returns boolean
language plpgsql
stable
security definer
set search_path = public
as $$
declare
  v_channel_id uuid;
begin
  if p_topic !~ '^channel:[0-9a-fA-F]{8}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{12}$' then
    return false;
  end if;
  v_channel_id := split_part(p_topic, ':', 2)::uuid;
  return public.can_access_channel(v_channel_id);
exception when others then
  return false;
end;
$$;

grant execute on function public.can_access_channel_topic(text) to authenticated;

-- ─── Realtime Authorization（private channel の join 認可）──────
create policy "users_can_receive_their_topics"
on realtime.messages for select
to authenticated
using (
  realtime.topic() = 'user:' || (select auth.uid())::text
  or public.can_access_channel_topic(realtime.topic())
);

-- ─── messages: INSERT/UPDATE（編集・ソフトデリート）を配信 ──────
create or replace function public.broadcast_messages_changes()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  perform realtime.broadcast_changes(
    'channel:' || coalesce(new.channel_id, old.channel_id)::text,
    tg_op, tg_op, tg_table_name, tg_table_schema, new, old
  );
  return null;
end;
$$;

create trigger broadcast_messages_changes
after insert or update on public.messages
for each row execute function public.broadcast_messages_changes();

-- ─── message_reactions: 行に channel_id がないため親メッセージから引く ──
create or replace function public.broadcast_message_reactions_changes()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  v_channel_id uuid;
begin
  select channel_id into v_channel_id
  from messages
  where id = coalesce(new.message_id, old.message_id);

  if v_channel_id is null then
    return null;
  end if;

  perform realtime.broadcast_changes(
    'channel:' || v_channel_id::text,
    tg_op, tg_op, tg_table_name, tg_table_schema, new, old
  );
  return null;
end;
$$;

create trigger broadcast_message_reactions_changes
after insert or update or delete on public.message_reactions
for each row execute function public.broadcast_message_reactions_changes();

-- ─── notifications: 本人のユーザートピックへ配信 ─────────────────
create or replace function public.broadcast_notifications_changes()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  perform realtime.broadcast_changes(
    'user:' || new.user_id::text,
    tg_op, tg_op, tg_table_name, tg_table_schema, new, old
  );
  return null;
end;
$$;

create trigger broadcast_notifications_changes
after insert on public.notifications
for each row execute function public.broadcast_notifications_changes();

-- ─── channel_read_states: 既読のデバイス間同期用 ─────────────────
create or replace function public.broadcast_channel_read_states_changes()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  perform realtime.broadcast_changes(
    'user:' || new.user_id::text,
    tg_op, tg_op, tg_table_name, tg_table_schema, new, old
  );
  return null;
end;
$$;

create trigger broadcast_channel_read_states_changes
after insert or update on public.channel_read_states
for each row execute function public.broadcast_channel_read_states_changes();

-- ─── postgres_changes 用 publication 登録の撤去 ─────────────────
-- Broadcast 移行により不要。0033 で追加した各テーブルの RLS SELECT ポリシーは
-- Data API（PostgREST）経由の直接読み取りを防ぐ防御として残す
alter publication supabase_realtime drop table
  public.messages,
  public.message_reactions,
  public.notifications,
  public.channel_read_states;
