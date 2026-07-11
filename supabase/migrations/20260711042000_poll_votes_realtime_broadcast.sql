create or replace function public.broadcast_poll_votes_changes()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  v_channel_id uuid;
  v_anonymous boolean;
  v_new public.poll_votes;
  v_old public.poll_votes;
begin
  select channel_id, anonymous into v_channel_id, v_anonymous
  from polls
  where id = coalesce(new.poll_id, old.poll_id);

  if v_channel_id is null then
    return null;
  end if;

  v_new := new;
  v_old := old;

  if v_anonymous then
    v_new := null;
    v_old := null;
  end if;

  perform realtime.broadcast_changes(
    'channel:' || v_channel_id::text,
    tg_op, tg_op, tg_table_name, tg_table_schema, v_new, v_old
  );
  return null;
end;
$$;

create trigger broadcast_poll_votes_changes
after insert or update or delete on public.poll_votes
for each row execute function public.broadcast_poll_votes_changes();
