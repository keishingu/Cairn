// Copyright 2026 Cairn Contributors
// SPDX-License-Identifier: Apache-2.0

import { NextResponse } from 'next/server'
import { ALLOWED_MIME_TYPES, FREE_ATTACHMENT_MAX_FILE_SIZE, normalizeMimeType, resolveFileType } from '@/lib/attachments'
import { getAuthContext } from '@/lib/get-auth-context'
import { resolveUploadEntitlements } from '@/lib/billing/entitlements'
import { requireChannelAccess } from '@/lib/permissions'
import { createServiceRoleClient } from '@/lib/supabase/service'

// 署名付きURLでのアップロード(upload-url)完了後、files レコードを登録し
// 検索インデックスジョブを発火する。ファイル本体はここを通らないため
// Vercel の 4.5MB リクエストボディ上限には掛からない。
export async function POST(req: Request) {
  const { ctx, error } = await getAuthContext()
  if (error) return error

  let body: {
    channelId?: unknown
    storagePath?: unknown
    fileName?: unknown
    mimeType?: unknown
    fileSize?: unknown
  }
  try {
    body = await req.json()
  } catch {
    return NextResponse.json({ error: 'Invalid JSON' }, { status: 400 })
  }

  const { channelId, storagePath, fileName, mimeType, fileSize } = body
  if (
    typeof channelId !== 'string' ||
    typeof storagePath !== 'string' ||
    typeof fileName !== 'string' ||
    typeof mimeType !== 'string' ||
    typeof fileSize !== 'number'
  ) {
    return NextResponse.json(
      { error: 'channelId・storagePath・fileName・mimeType・fileSize は必須です' },
      { status: 400 },
    )
  }

  const normalizedMime = normalizeMimeType(fileName, mimeType)
  if (!ALLOWED_MIME_TYPES.has(normalizedMime)) {
    return NextResponse.json(
      {
        error:
          '対応していないファイル形式です（画像・PDF・Word・Excel・PowerPoint・CSV・テキスト）',
      },
      { status: 400 },
    )
  }

  // storagePath は upload-url が発行した `${workspaceId}/${channelId}/...` 形式のはず。
  // クライアントが任意のパスを渡して他ワークスペースのオブジェクトを登録できないよう検証する
  const expectedPrefix = `${ctx.workspaceId}/${channelId}/`
  if (!storagePath.startsWith(expectedPrefix) || storagePath.includes('..')) {
    return NextResponse.json({ error: '不正な storagePath です' }, { status: 400 })
  }

  const forbidden = await requireChannelAccess(ctx.workspaceId, ctx.userId, channelId, ctx.role)
  if (forbidden) return forbidden

  const { db, files } = await import('@cairn/db')
  const { and, eq, sql } = await import('drizzle-orm')

  // 応答喪失後の再試行は、現在の支援・残高が失効していても既に確定済みの
  // オブジェクトを消してはならない。冪等に既存の登録結果を返す。
  const [existing] = await db
    .select({
      id: files.id,
      fileName: files.fileName,
      mimeType: files.mimeType,
      fileSize: files.fileSize,
    })
    .from(files)
    .where(and(eq(files.workspaceId, ctx.workspaceId), eq(files.storagePath, storagePath)))
    .limit(1)
  if (existing) {
    return NextResponse.json(
      {
        fileId: existing.id,
        fileName: existing.fileName,
        mimeType: existing.mimeType,
        fileSize: existing.fileSize,
      },
      { status: 200 },
    )
  }

  const supabase = createServiceRoleClient()

  // アップロードが実際に完了しているか確認し、権威あるファイルサイズを取得する
  // （クライアント申告値のなりすまし・アップロード未完了での登録を防ぐ）
  const lastSlash = storagePath.lastIndexOf('/')
  const folder = storagePath.slice(0, lastSlash)
  const objectName = storagePath.slice(lastSlash + 1)
  const { data: listed, error: listError } = await supabase.storage
    .from('chat-attachments')
    .list(folder, { search: objectName })

  if (listError) {
    console.error('[/api/attachments/finalize] Storage list failed:', listError)
    return NextResponse.json({ error: 'アップロードの確認に失敗しました' }, { status: 500 })
  }

  const object = listed?.find((o) => o.name === objectName)
  if (!object) {
    return NextResponse.json(
      { error: 'アップロードされたファイルが見つかりません' },
      { status: 400 },
    )
  }

  const actualSize =
    typeof object.metadata?.['size'] === 'number' ? (object.metadata['size'] as number) : fileSize
  if (actualSize > FREE_ATTACHMENT_MAX_FILE_SIZE) {
    const entitlements = await resolveUploadEntitlements(ctx.workspaceId, ctx.userId)
    if (!entitlements.rights.canUploadLargeFile) {
      // 成功側も同じ advisory lock を取得する。判定後に並行 finalize が確定しても
      // そのオブジェクトを削除しない。
      const committed = await db.transaction(async (tx) => {
        await tx.execute(sql`SELECT pg_advisory_xact_lock(hashtextextended(${`attachment:${ctx.workspaceId}:${storagePath}`}, 0))`)
        const [file] = await tx
          .select({ id: files.id, fileName: files.fileName, mimeType: files.mimeType, fileSize: files.fileSize })
          .from(files)
          .where(and(eq(files.workspaceId, ctx.workspaceId), eq(files.storagePath, storagePath)))
          .limit(1)
        return file ?? null
      })
      if (committed) {
        return NextResponse.json(
          { fileId: committed.id, fileName: committed.fileName, mimeType: committed.mimeType, fileSize: committed.fileSize },
          { status: 200 },
        )
      }
      await supabase.storage.from('chat-attachments').remove([storagePath])
      return NextResponse.json(
        { error: '5MBを超えるファイルを保存するには、残高のある有効な支援が必要です' },
        { status: 403 },
      )
    }
  }
  let thumbnailPath: string | null = null
  if (normalizedMime.startsWith('image/')) {
    try {
      const { createThumbnailFromStorage } = await import('@/lib/attachments/thumbnail')
      thumbnailPath = await createThumbnailFromStorage(supabase, storagePath)
    } catch (e) {
      console.warn('[/api/attachments/finalize] Thumbnail generation failed (serving original):', e)
    }
  }

  try {
    const { channels } = await import('@cairn/db')

    // プロジェクトチャンネル経由のアップロードは projectId を紐付け、
    // プロジェクト削除時の CASCADE で files レコードも自動削除されるようにする
    const [channel] = await db
      .select({ projectId: channels.projectId })
      .from(channels)
      .where(eq(channels.id, channelId))
      .limit(1)

    const finalized = await db.transaction(async (tx) => {
      await tx.execute(sql`SELECT pg_advisory_xact_lock(hashtextextended(${`attachment:${ctx.workspaceId}:${storagePath}`}, 0))`)
      const [file] = await tx
        .insert(files)
        .values({
          workspaceId: ctx.workspaceId,
          projectId: channel?.projectId ?? null,
          uploadedBy: ctx.userId,
          storagePath,
          fileName,
          mimeType: normalizedMime,
          fileSize: actualSize,
          fileType: resolveFileType(normalizedMime),
          metadata: thumbnailPath ? { thumbnailPath } : {},
        })
        // 署名付きURLの完了通知はネットワーク再試行され得る。同一オブジェクトの
        // 二重登録・使用量の二重加算を防ぐため、storagePath を冪等キーにする。
        .onConflictDoNothing({ target: [files.workspaceId, files.storagePath] })
        .returning()

      if (!file) {
        const [existing] = await tx
          .select()
          .from(files)
          .where(
            and(eq(files.workspaceId, ctx.workspaceId), eq(files.storagePath, storagePath)),
          )
          .limit(1)
        if (!existing) throw new Error('Conflicted insert returned no rows')
        return { file: existing, created: false }
      }

      const { recordStorageUsageDelta } = await import('@/lib/billing/storage-usage')
      await recordStorageUsageDelta(
        ctx.workspaceId,
        { originalBytes: actualSize, derivedBytes: 0 },
        tx,
      )
      return { file, created: true }
    })

    if (!finalized) throw new Error('Insert returned no rows')

    const { isIndexable } = await import('@/lib/ai/extract-text')
    if (finalized.created && isIndexable(normalizedMime)) {
      try {
        const { inngest } = await import('@/lib/inngest/client')
        await inngest.send({
          name: 'file/uploaded',
          data: {
            fileId: finalized.file.id,
            workspaceId: ctx.workspaceId,
            mimeType: normalizedMime,
            storagePath,
          },
        })
      } catch (e) {
        console.warn('[/api/attachments/finalize] Inngest event send failed (indexing skipped):', e)
      }
    }

    return NextResponse.json(
      {
        fileId: finalized.file.id,
        fileName: finalized.file.fileName,
        mimeType: finalized.file.mimeType,
        fileSize: finalized.file.fileSize,
      },
      { status: finalized.created ? 201 : 200 },
    )
  } catch (err) {
    // DBインサート失敗時はストレージをロールバック（サムネがあれば併せて削除）
    await supabase.storage
      .from('chat-attachments')
      .remove(thumbnailPath ? [storagePath, thumbnailPath] : [storagePath])
    console.error('[/api/attachments/finalize] DB insert failed:', err)
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 })
  }
}
