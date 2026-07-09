-- 非活性メンバーは chat-attachments を Storage API 経由で読み書きできないようにする。
-- 既存 0007 を書き換えると適用済み DB に反映されないため、後続 migration でポリシーを差し替える。

drop policy if exists "chat_attachments_select" on storage.objects;
create policy "chat_attachments_select"
on storage.objects for select
to authenticated
using (
  bucket_id = 'chat-attachments'
  and (storage.foldername(name))[1] in (
    select wm.workspace_id::text
    from workspace_members wm
    where wm.user_id = auth.uid()
      and wm.membership_status = 'active'
  )
);

drop policy if exists "chat_attachments_insert" on storage.objects;
create policy "chat_attachments_insert"
on storage.objects for insert
to authenticated
with check (
  bucket_id = 'chat-attachments'
  and (storage.foldername(name))[1] in (
    select wm.workspace_id::text
    from workspace_members wm
    where wm.user_id = auth.uid()
      and wm.membership_status = 'active'
  )
);

drop policy if exists "chat_attachments_delete" on storage.objects;
create policy "chat_attachments_delete"
on storage.objects for delete
to authenticated
using (
  bucket_id = 'chat-attachments'
  and owner_id = auth.uid()::text
  and (storage.foldername(name))[1] in (
    select wm.workspace_id::text
    from workspace_members wm
    where wm.user_id = auth.uid()
      and wm.membership_status = 'active'
  )
);
