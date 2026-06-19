// Copyright 2026 Cairn Contributors
// SPDX-License-Identifier: Apache-2.0

import { NextResponse } from 'next/server'
import { getAuthContext } from '@/lib/get-auth-context'
import { createServiceRoleClient } from '@/lib/supabase/service'
import { generateThumbnail, thumbnailStoragePath } from '@/lib/attachments/thumbnail'

const MAX_FILE_SIZE = 10 * 1024 * 1024
// 画像はオリジナルもこの最長辺へ縮小してから保存する（チャット直アップロードは生画像が上がってくるため）
const MAX_ORIGINAL_DIMENSION = 2048
const ALLOWED_MIME_TYPES = new Set([
  'image/jpeg', 'image/png', 'image/gif', 'image/webp',
  'application/pdf',
  'application/msword',
  'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
  'application/vnd.ms-excel',
  'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
  'text/plain',
  'text/markdown',
])

function resolveFileType(mimeType: string): 'image' | 'document' | 'other' {
  if (mimeType.startsWith('image/')) return 'image'
  if (
    mimeType === 'application/pdf' ||
    mimeType === 'application/msword' ||
    mimeType === 'application/vnd.openxmlformats-officedocument.wordprocessingml.document' ||
    mimeType === 'application/vnd.ms-excel' ||
    mimeType === 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet'
  ) return 'document'
  return 'other'
}

export async function POST(req: Request) {
  const { ctx, error } = await getAuthContext()
  if (error) return error

  let formData: FormData
  try {
    formData = await req.formData()
  } catch {
    return NextResponse.json({ error: 'Invalid form data' }, { status: 400 })
  }

  const file = formData.get('file')
  const channelId = formData.get('channelId')

  if (!(file instanceof File) || typeof channelId !== 'string') {
    return NextResponse.json({ error: 'file と channelId は必須です' }, { status: 400 })
  }

  if (!ALLOWED_MIME_TYPES.has(file.type)) {
    return NextResponse.json({ error: '対応していないファイル形式です（画像・PDF・Word・Excel・テキスト）' }, { status: 400 })
  }

  if (file.size > MAX_FILE_SIZE) {
    return NextResponse.json({ error: 'ファイルサイズは 10MB 以下にしてください' }, { status: 400 })
  }

  const ext = file.name.split('.').pop() ?? 'bin'
  const storagePath = `${ctx.workspaceId}/${channelId}/${crypto.randomUUID()}.${ext}`

  const supabase = createServiceRoleClient()
  const isImage = file.type.startsWith('image/')

  // 画像はオリジナルを最長辺 2048px へ縮小してから保存する。
  // 縮小に失敗した場合は元のまま保存する（保存自体は止めない）。
  let body: Buffer<ArrayBufferLike> = Buffer.from(await file.arrayBuffer())
  if (isImage) {
    try {
      const sharp = (await import('sharp')).default
      body = await sharp(body)
        .rotate()
        .resize({ width: MAX_ORIGINAL_DIMENSION, height: MAX_ORIGINAL_DIMENSION, fit: 'inside', withoutEnlargement: true })
        .toBuffer()
    } catch (e) {
      console.warn('[/api/attachments/upload] Original resize failed (storing as-is):', e)
    }
  }

  const { error: uploadError } = await supabase.storage
    .from('chat-attachments')
    .upload(storagePath, body, { contentType: file.type, upsert: false })

  if (uploadError) {
    console.error('[/api/attachments/upload] Storage upload failed:', uploadError)
    return NextResponse.json({ error: 'アップロードに失敗しました' }, { status: 500 })
  }

  // 一覧アイコン・チャットのサムネ表示用に縮小版を別途生成して保存する。
  // 生成に失敗してもオリジナルは配信できるので致命的にしない（配信側がフォールバックする）。
  let thumbnailPath: string | null = null
  if (isImage) {
    try {
      const thumb = await generateThumbnail(body)
      const candidatePath = thumbnailStoragePath(storagePath)
      const { error: thumbError } = await supabase.storage
        .from('chat-attachments')
        .upload(candidatePath, thumb, { contentType: 'image/jpeg', upsert: false })
      if (thumbError) {
        console.warn('[/api/attachments/upload] Thumbnail upload failed (serving original):', thumbError)
      } else {
        thumbnailPath = candidatePath
      }
    } catch (e) {
      console.warn('[/api/attachments/upload] Thumbnail generation failed (serving original):', e)
    }
  }

  try {
    const { db, files, channels } = await import('@cairn/db')
    const { eq } = await import('drizzle-orm')

    // プロジェクトチャンネル経由のアップロードは projectId を紐付け、
    // プロジェクト削除時の CASCADE で files レコードも自動削除されるようにする
    const [channel] = await db
      .select({ projectId: channels.projectId })
      .from(channels)
      .where(eq(channels.id, channelId))
      .limit(1)

    const [inserted] = await db
      .insert(files)
      .values({
        workspaceId: ctx.workspaceId,
        projectId: channel?.projectId ?? null,
        uploadedBy: ctx.userId,
        storagePath,
        fileName: file.name,
        mimeType: file.type,
        fileSize: body.length,
        fileType: resolveFileType(file.type),
        metadata: thumbnailPath ? { thumbnailPath } : {},
      })
      .returning()

    if (!inserted) throw new Error('Insert returned no rows')

    const { isIndexable } = await import('@/lib/ai/extract-text')
    if (isIndexable(file.type)) {
      try {
        const { inngest } = await import('@/lib/inngest/client')
        await inngest.send({
          name: 'file/uploaded',
          data: {
            fileId: inserted.id,
            workspaceId: ctx.workspaceId,
            mimeType: file.type,
            storagePath,
          },
        })
      } catch (e) {
        console.warn('[/api/attachments/upload] Inngest event send failed (indexing skipped):', e)
      }
    }

    return NextResponse.json(
      {
        fileId: inserted.id,
        fileName: inserted.fileName,
        mimeType: inserted.mimeType,
        fileSize: inserted.fileSize,
      },
      { status: 201 },
    )
  } catch (err) {
    // DBインサート失敗時はストレージをロールバック（サムネも併せて削除）
    await supabase.storage.from('chat-attachments').remove(thumbnailPath ? [storagePath, thumbnailPath] : [storagePath])
    console.error('[/api/attachments/upload] DB insert failed:', err)
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 })
  }
}
