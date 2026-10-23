-- 非活性メンバーの「直アクセス経路」を塞ぐ。TS のアプリ層だけでなく、
-- Storage RLS と Realtime 認可関数も active membership を必須にする。
-- active の定義は active_workspace_members ビュー 1 箇所に集約されているため、ここでも
-- membership_status を直接書かずビューを参照する（定義変更が全経路に波及する）。

-- ─── Storage: chat-attachments を active membership に限定 ───────────
DROP POLICY IF EXISTS "chat_attachments_select" ON storage.objects;
CREATE POLICY "chat_attachments_select"
ON storage.objects FOR SELECT TO authenticated
USING (
  bucket_id = 'chat-attachments'
  AND (storage.foldername(name))[1] IN (
    SELECT workspace_id::text
    FROM active_workspace_members
    WHERE user_id = auth.uid()
  )
);

DROP POLICY IF EXISTS "chat_attachments_insert" ON storage.objects;
CREATE POLICY "chat_attachments_insert"
ON storage.objects FOR INSERT TO authenticated
WITH CHECK (
  bucket_id = 'chat-attachments'
  AND (storage.foldername(name))[1] IN (
    SELECT workspace_id::text
    FROM active_workspace_members
    WHERE user_id = auth.uid()
  )
);

DROP POLICY IF EXISTS "chat_attachments_delete" ON storage.objects;
CREATE POLICY "chat_attachments_delete"
ON storage.objects FOR DELETE TO authenticated
USING (
  bucket_id = 'chat-attachments'
  AND owner_id = auth.uid()::text
  AND (storage.foldername(name))[1] IN (
    SELECT workspace_id::text
    FROM active_workspace_members
    WHERE user_id = auth.uid()
  )
);

-- ─── Realtime: can_access_channel を active membership に限定 ─────────
-- 非活性メンバーが Realtime のメッセージ・リアクション等を受信し続けないようにする。
-- deactivation は履歴のため channel_members 行を残すので、プライベート・DM でも
-- 「チャンネルメンバーである」だけでなく「当該 WS の active メンバーである」ことを要求する。
create or replace function public.can_access_channel(p_channel_id uuid)
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select exists (
    select 1
    from channels c
    where c.id = p_channel_id
      -- 全チャンネル共通: 当該ワークスペースの active メンバーであること
      and exists (
        select 1 from active_workspace_members wm
        where wm.user_id = auth.uid()
          and wm.workspace_id = coalesce(
            c.workspace_id,
            (select p.workspace_id from projects p where p.id = c.project_id)
          )
      )
      and (
        -- プライベートチャンネル・DM: チャンネルメンバーのみ
        (
          (c.is_private = true or c.type = 'dm')
          and exists (
            select 1 from channel_members cm
            where cm.channel_id = c.id and cm.user_id = auth.uid()
          )
        )
        or
        -- 公開チャンネル（workspace / project）: 同一ワークスペースの active メンバー全員
        (
          c.is_private = false
          and c.type in ('workspace', 'project')
        )
      )
  );
$$;
