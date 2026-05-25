// Copyright 2026 Cairn Contributors
// SPDX-License-Identifier: Apache-2.0

import { NextResponse } from 'next/server'
import { getAuthContext } from '@/lib/get-auth-context'
import { createServiceRoleClient } from '@/lib/supabase/service'

const MAX_FILE_SIZE = 10 * 1024 * 1024
const ALLOWED_MIME_TYPES = new Set([
  'image/jpeg', 'image/png', 'image/gif', 'image/webp',
  'application/pdf',
  'application/msword',
  'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
  'application/vnd.ms-excel',
  'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
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

  if (!process.env['DATABASE_URL']) {
    return NextResponse.json({ error: 'ローカル開発モードではファイルアップロードは利用できません' }, { status: 501 })
  }

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
    return NextResponse.json({ error: '対応していないファイル形式です（画像・PDF・Word・Excel）' }, { status: 400 })
  }

  if (file.size > MAX_FILE_SIZE) {
    return NextResponse.json({ error: 'ファイルサイズは 10MB 以下にしてください' }, { status: 400 })
  }

  const ext = file.name.split('.').pop() ?? 'bin'
  const storagePath = `${ctx.workspaceId}/${channelId}/${crypto.randomUUID()}.${ext}`

  const supabase = createServiceRoleClient()
  const buffer = await file.arrayBuffer()

  const { error: uploadError } = await supabase.storage
    .from('chat-attachments')
    .upload(storagePath, buffer, { contentType: file.type, upsert: false })

  if (uploadError) {
    console.error('[/api/attachments/upload] Storage upload failed:', uploadError)
    return NextResponse.json({ error: 'アップロードに失敗しました' }, { status: 500 })
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
        fileSize: file.size,
        fileType: resolveFileType(file.type),
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
    // DBインサート失敗時はストレージをロールバック
    await supabase.storage.from('chat-attachments').remove([storagePath])
    console.error('[/api/attachments/upload] DB insert failed:', err)
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 })
  }
}
