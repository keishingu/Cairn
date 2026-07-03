-- chat-attachments storage policy でも active membership を必須にする。
-- 旧 0007 を直接変更すると適用済み DB に反映されないため、ここで現行 policy を差し替える。
drop policy if exists "chat_attachments_select" on storage.objects;
create policy "chat_attachments_select"
on storage.objects for select to authenticated
using (
  bucket_id = 'chat-attachments'
  and (storage.foldername(name))[1] in (
    select workspace_id::text
    from workspace_members
    where user_id = auth.uid()
      and membership_status = 'active'
  )
);

drop policy if exists "chat_attachments_insert" on storage.objects;
create policy "chat_attachments_insert"
on storage.objects for insert to authenticated
with check (
  bucket_id = 'chat-attachments'
  and (storage.foldername(name))[1] in (
    select workspace_id::text
    from workspace_members
    where user_id = auth.uid()
      and membership_status = 'active'
  )
);

drop policy if exists "chat_attachments_delete" on storage.objects;
create policy "chat_attachments_delete"
on storage.objects for delete to authenticated
using (
  bucket_id = 'chat-attachments'
  and owner_id = auth.uid()::text
  and (storage.foldername(name))[1] in (
    select workspace_id::text
    from workspace_members
    where user_id = auth.uid()
      and membership_status = 'active'
  )
);
