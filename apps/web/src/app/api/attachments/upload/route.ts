// Copyright 2026 Cairn Contributors
// SPDX-License-Identifier: Apache-2.0

import { NextResponse } from 'next/server'
import { getAuthContext } from '@/lib/get-auth-context'
import { requireChannelAccess } from '@/lib/permissions'
import { createServiceRoleClient } from '@/lib/supabase/service'

const MAX_FILE_SIZE = 10 * 1024 * 1024
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

// ブラウザが実体を判定できなかったときに返す汎用 MIME タイプ。
// これらは形式の手がかりにならないため、拡張子・マジックナンバーで補完する。
const GENERIC_MIME_TYPES = new Set(['', 'application/octet-stream'])

// ブラウザが file.type を返さない（空文字や application/octet-stream）ケースが
// あるため、拡張子から正規の MIME タイプを補完する。これがないと正しい形式の
// PDF などが「対応していないファイル形式」として弾かれてしまう。
const EXTENSION_TO_MIME: Record<string, string> = {
  jpg: 'image/jpeg',
  jpeg: 'image/jpeg',
  png: 'image/png',
  gif: 'image/gif',
  webp: 'image/webp',
  pdf: 'application/pdf',
  doc: 'application/msword',
  docx: 'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
  xls: 'application/vnd.ms-excel',
  xlsx: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
  txt: 'text/plain',
  md: 'text/markdown',
  markdown: 'text/markdown',
}

// 正規の MIME タイプから保存用の拡張子を引く。拡張子無しのファイル名でも
// ストレージパスに正しい拡張子を付けられるようにする。
const MIME_TO_EXT: Record<string, string> = {
  'image/jpeg': 'jpg',
  'image/png': 'png',
  'image/gif': 'gif',
  'image/webp': 'webp',
  'application/pdf': 'pdf',
  'application/msword': 'doc',
  'application/vnd.openxmlformats-officedocument.wordprocessingml.document': 'docx',
  'application/vnd.ms-excel': 'xls',
  'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet': 'xlsx',
  'text/plain': 'txt',
  'text/markdown': 'md',
}

// ファイル先頭のマジックナンバーから実体の MIME タイプを判定する。
// 拡張子も無く file.type も汎用（application/octet-stream）なケースの最終手段。
function sniffMimeType(bytes: Uint8Array): string | null {
  // PDF: "%PDF"
  if (bytes.length >= 4 && bytes[0] === 0x25 && bytes[1] === 0x50 && bytes[2] === 0x44 && bytes[3] === 0x46) {
    return 'application/pdf'
  }
  // PNG: 89 50 4E 47
  if (bytes.length >= 4 && bytes[0] === 0x89 && bytes[1] === 0x50 && bytes[2] === 0x4e && bytes[3] === 0x47) {
    return 'image/png'
  }
  // JPEG: FF D8 FF
  if (bytes.length >= 3 && bytes[0] === 0xff && bytes[1] === 0xd8 && bytes[2] === 0xff) {
    return 'image/jpeg'
  }
  // GIF: "GIF8"
  if (bytes.length >= 4 && bytes[0] === 0x47 && bytes[1] === 0x49 && bytes[2] === 0x46 && bytes[3] === 0x38) {
    return 'image/gif'
  }
  // WebP: "RIFF"...."WEBP"
  if (
    bytes.length >= 12 &&
    bytes[0] === 0x52 && bytes[1] === 0x49 && bytes[2] === 0x46 && bytes[3] === 0x46 &&
    bytes[8] === 0x57 && bytes[9] === 0x45 && bytes[10] === 0x42 && bytes[11] === 0x50
  ) {
    return 'image/webp'
  }
  return null
}

// file.type が許可リストにあればそれを優先し、無ければ拡張子から補完する。
// ここで解決できない場合はマジックナンバー判定（sniffMimeType）に委ねる。
function resolveMimeTypeByName(fileType: string, fileName: string): string | null {
  if (ALLOWED_MIME_TYPES.has(fileType)) return fileType
  const ext = fileName.includes('.') ? (fileName.split('.').pop()?.toLowerCase() ?? '') : ''
  return EXTENSION_TO_MIME[ext] ?? null
}

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
    console.warn('[/api/attachments/upload] rejected: missing file/channelId', {
      hasFile: file instanceof File,
      channelIdType: typeof channelId,
    })
    return NextResponse.json({ error: 'file と channelId は必須です' }, { status: 400 })
  }

  if (file.size > MAX_FILE_SIZE) {
    console.warn('[/api/attachments/upload] rejected: too large', {
      fileName: file.name,
      fileSize: file.size,
      limit: MAX_FILE_SIZE,
    })
    return NextResponse.json({ error: 'ファイルサイズは 10MB 以下にしてください' }, { status: 400 })
  }

  // file.type と拡張子で判定できない場合のみ、中身を読んでマジックナンバーで判定する。
  // 読み込んだバッファは後段のアップロードでも再利用し、二重読み込みを避ける。
  let buffer: ArrayBuffer | null = null
  let mimeType = resolveMimeTypeByName(file.type, file.name)
  if (!mimeType) {
    buffer = await file.arrayBuffer()
    mimeType = sniffMimeType(new Uint8Array(buffer.slice(0, 16)))
  }
  if (!mimeType) {
    // 拡張子も具体的な MIME も無く中身からも判別できない場合は「不明」として
    // 拡張子付与を促す。形式が分かるのに非対応なケース（例: .zip）とは区別する。
    const identifiable = file.name.includes('.') || !GENERIC_MIME_TYPES.has(file.type)
    const errorMessage = identifiable
      ? '対応していないファイル形式です（画像・PDF・Word・Excel・テキスト）'
      : 'ファイル形式が不明です。拡張子をつけて再度アップロードしてください'
    console.warn('[/api/attachments/upload] rejected: unsupported type', {
      browserType: file.type,
      fileName: file.name,
      fileSize: file.size,
      identifiable,
    })
    return NextResponse.json({ error: errorMessage }, { status: 400 })
  }

  const forbidden = await requireChannelAccess(ctx.workspaceId, ctx.userId, channelId)
  if (forbidden) return forbidden

  // 拡張子が無いファイル名でも正しい拡張子を付ける（無ければ MIME から補完）
  const ext = file.name.includes('.') ? (file.name.split('.').pop() ?? 'bin') : (MIME_TO_EXT[mimeType] ?? 'bin')
  const storagePath = `${ctx.workspaceId}/${channelId}/${crypto.randomUUID()}.${ext}`

  const supabase = createServiceRoleClient()

  if (buffer === null) buffer = await file.arrayBuffer()
  const { error: uploadError } = await supabase.storage
    .from('chat-attachments')
    .upload(storagePath, buffer, { contentType: mimeType, upsert: false })

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
        mimeType,
        fileSize: file.size,
        fileType: resolveFileType(mimeType),
      })
      .returning()

    if (!inserted) throw new Error('Insert returned no rows')

    const { isIndexable } = await import('@/lib/ai/extract-text')
    if (isIndexable(mimeType)) {
      try {
        const { inngest } = await import('@/lib/inngest/client')
        await inngest.send({
          name: 'file/uploaded',
          data: {
            fileId: inserted.id,
            workspaceId: ctx.workspaceId,
            mimeType,
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
