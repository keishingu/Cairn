-- ギャラリー画像は認証不要で閲覧できるパブリックバケットで管理する

INSERT INTO storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
VALUES (
  'gallery',
  'gallery',
  true,
  20971520, -- 20 MiB
  ARRAY['image/jpeg', 'image/png', 'image/gif', 'image/webp', 'image/heic']
)
ON CONFLICT (id) DO NOTHING;

CREATE POLICY "gallery_insert"
ON storage.objects FOR INSERT TO authenticated
WITH CHECK (bucket_id = 'gallery');

-- パブリックバケットのため SELECT は全ユーザーに許可
CREATE POLICY "gallery_select"
ON storage.objects FOR SELECT
USING (bucket_id = 'gallery');
