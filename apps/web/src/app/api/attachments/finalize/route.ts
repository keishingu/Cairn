// Copyright 2026 Cairn Contributors
// SPDX-License-Identifier: Apache-2.0

import { NextResponse } from 'next/server'
import { BILLING_CONFIG } from '@cairn/core/billing'
import {
  ALLOWED_MIME_TYPES,
  FREE_ATTACHMENT_MAX_FILE_SIZE,
  normalizeMimeType,
  resolveFileType,
} from '@/lib/attachments'
import { getAuthContext } from '@/lib/get-auth-context'
import { resolveUploadEntitlements } from '@/lib/billing/entitlements'
import { isBillingEnabled } from '@/lib/billing/is-billing-enabled'
import { requireChannelAccess } from '@/lib/permissions'
import { createServiceRoleClient } from '@/lib/supabase/service'
import { ATTACHMENTS_BUCKET } from '@/lib/attachments/thumbnail'
import { hasAttachmentUploadRequestSchema } from '@/lib/uploads/schema-readiness'

const PAID_STORAGE_ENTITLEMENT_ERROR = 'paid-storage-entitlement-required'
const UPLOAD_REQUEST_EXPIRED_ERROR = 'upload-request-expired'

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
  const expectedPrefix = `${ctx.workspaceId}/${channelId}/${ctx.userId}/`
  if (!storagePath.startsWith(expectedPrefix) || storagePath.includes('..')) {
    return NextResponse.json({ error: '不正な storagePath です' }, { status: 400 })
  }

  const forbidden = await requireChannelAccess(ctx.workspaceId, ctx.userId, channelId, ctx.role)
  if (forbidden) return forbidden

  const { creditLedger, db, files, subscriptions, uploadRequests, workspaceStorageUsage } =
    await import('@cairn/db')
  const { and, eq, gt, isNull, sql } = await import('drizzle-orm')

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

  if (!(await hasAttachmentUploadRequestSchema(db))) {
    return NextResponse.json(
      { error: 'アップロード機能を更新中です。少し待ってから再試行してください' },
      { status: 503 },
    )
  }

  const [uploadRequest] = await db
    .select({ id: uploadRequests.id })
    .from(uploadRequests)
    .where(
      and(
        eq(uploadRequests.workspaceId, ctx.workspaceId),
        eq(uploadRequests.requestedBy, ctx.userId),
        eq(uploadRequests.derivedStoragePath, storagePath),
        eq(uploadRequests.storageBucket, ATTACHMENTS_BUCKET),
        isNull(uploadRequests.projectId),
        isNull(uploadRequests.finalizedAt),
      ),
    )
    .limit(1)
  if (!uploadRequest) {
    return NextResponse.json({ error: 'アップロード情報が見つかりません' }, { status: 404 })
  }

  const supabase = createServiceRoleClient()
  const removeIfUnfinalized = async (paths: string[]) =>
    db.transaction(async (tx) => {
      // 削除する間も成功側の finalize を直列化する。同じパスの成功側が、この判定の後に
      // files 行を確定してからオブジェクトだけ削除される競合を防ぐ。
      await tx.execute(
        sql`SELECT pg_advisory_xact_lock(hashtextextended(${`attachment:${ctx.workspaceId}:${storagePath}`}, 0))`,
      )
      const [file] = await tx
        .select({
          id: files.id,
          fileName: files.fileName,
          mimeType: files.mimeType,
          fileSize: files.fileSize,
        })
        .from(files)
        .where(and(eq(files.workspaceId, ctx.workspaceId), eq(files.storagePath, storagePath)))
        .limit(1)
      if (file) return file

      const { error: removeError } = await supabase.storage.from(ATTACHMENTS_BUCKET).remove(paths)
      if (removeError)
        throw new Error(`Failed to remove rejected attachment: ${removeError.message}`)
      // 署名URLは拒否後もしばらく有効なため、意図レコードは期限切れ清掃まで残す。
      // 後着の PUT でオブジェクトが再作成されても hourly cleanup が回収できる。
      return null
    })

  // アップロードが実際に完了しているか確認し、権威あるファイルサイズを取得する
  // （クライアント申告値のなりすまし・アップロード未完了での登録を防ぐ）
  const lastSlash = storagePath.lastIndexOf('/')
  const folder = storagePath.slice(0, lastSlash)
  const objectName = storagePath.slice(lastSlash + 1)
  const { data: listed, error: listError } = await supabase.storage
    .from(ATTACHMENTS_BUCKET)
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
      let committed: {
        id: string
        fileName: string
        mimeType: string | null
        fileSize: number | null
      } | null
      try {
        committed = await removeIfUnfinalized([storagePath])
      } catch (cleanupError) {
        console.error('[/api/attachments/finalize] Rejected object cleanup failed:', cleanupError)
        return NextResponse.json(
          { error: 'アップロード済みファイルの削除に失敗しました' },
          { status: 500 },
        )
      }
      if (committed) {
        return NextResponse.json(
          {
            fileId: committed.id,
            fileName: committed.fileName,
            mimeType: committed.mimeType,
            fileSize: committed.fileSize,
          },
          { status: 200 },
        )
      }
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
      const lockedResult = await tx.execute<{
        id: string
        expires_at: Date
        finalized_at: Date | null
        file_id: string | null
      }>(sql`
        select id, expires_at, finalized_at, file_id
        from upload_requests
        where id = ${uploadRequest.id}
          and workspace_id = ${ctx.workspaceId}
          and requested_by = ${ctx.userId}
          and derived_storage_path = ${storagePath}
          and storage_bucket = ${ATTACHMENTS_BUCKET}
          and project_id is null
        for update
      `)
      const lockedUploadRequest = lockedResult.rows[0]
      if (!lockedUploadRequest || lockedUploadRequest.expires_at <= new Date()) {
        throw new Error(UPLOAD_REQUEST_EXPIRED_ERROR)
      }
      if (lockedUploadRequest.finalized_at && lockedUploadRequest.file_id) {
        const [committed] = await tx
          .select()
          .from(files)
          .where(eq(files.id, lockedUploadRequest.file_id))
          .limit(1)
        if (!committed) throw new Error('Finalized upload file was not found')
        return { file: committed, created: false }
      }
      await tx.execute(
        sql`SELECT pg_advisory_xact_lock(hashtextextended(${`attachment:${ctx.workspaceId}:${storagePath}`}, 0))`,
      )
      if (isBillingEnabled()) {
        // 使用量行を先に作成してロックする。これにより初回アップロード同士でも無料枠の
        // 超過判定が競合せず、以後の使用量加算まで同じ行を直列化できる。
        await tx
          .insert(workspaceStorageUsage)
          .values({ workspaceId: ctx.workspaceId })
          .onConflictDoNothing()

        // 既存容量の家賃を先に精算して usage 行をロックし、残高を同じTXで再判定する。
        // これにより複数の大容量 finalize が同じ古い残高を同時に消費できない。
        const { settleWorkspaceStorageRent } = await import('@/lib/billing/storage-rent')
        await settleWorkspaceStorageRent(tx, ctx.workspaceId)
        const [usage] = await tx
          .select({ originalBytes: workspaceStorageUsage.originalBytes })
          .from(workspaceStorageUsage)
          .where(eq(workspaceStorageUsage.workspaceId, ctx.workspaceId))
          .for('update')
          .limit(1)
        const exceedsFreeStorageAllowance =
          Number(usage?.originalBytes ?? 0) + actualSize > BILLING_CONFIG.freeStorageBytes
        const requiresPaidStorage =
          actualSize > FREE_ATTACHMENT_MAX_FILE_SIZE || exceedsFreeStorageAllowance
        if (requiresPaidStorage) {
          const [[balance], [subscription]] = await Promise.all([
            tx
              .select({ balance: sql<string>`COALESCE(SUM(${creditLedger.delta}), 0)` })
              .from(creditLedger)
              .where(eq(creditLedger.workspaceId, ctx.workspaceId)),
            tx
              .select({ id: subscriptions.id })
              .from(subscriptions)
              .where(
                and(
                  eq(subscriptions.workspaceId, ctx.workspaceId),
                  eq(subscriptions.supporterUserId, ctx.userId),
                  eq(subscriptions.plan, 'individual'),
                  eq(subscriptions.status, 'active'),
                  gt(subscriptions.currentPeriodEnd, new Date()),
                ),
              )
              .limit(1),
          ])
          if (!subscription || Number(balance?.balance ?? 0) <= 0) {
            throw new Error(PAID_STORAGE_ENTITLEMENT_ERROR)
          }
        }
      }
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
          .where(and(eq(files.workspaceId, ctx.workspaceId), eq(files.storagePath, storagePath)))
          .limit(1)
        if (!existing) throw new Error('Conflicted insert returned no rows')
        await tx
          .update(uploadRequests)
          .set({ fileId: existing.id, finalizedAt: new Date() })
          .where(eq(uploadRequests.id, lockedUploadRequest.id))
        return { file: existing, created: false }
      }

      const { recordStorageUsageDelta } = await import('@/lib/billing/storage-usage')
      await recordStorageUsageDelta(
        ctx.workspaceId,
        { originalBytes: actualSize, derivedBytes: 0 },
        tx,
      )
      await tx
        .update(uploadRequests)
        .set({ fileId: file.id, finalizedAt: new Date() })
        .where(eq(uploadRequests.id, lockedUploadRequest.id))
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
    // 競合した別 finalize が確定済みなら、そのオブジェクトをロールバックしてはならない。
    try {
      await removeIfUnfinalized(thumbnailPath ? [storagePath, thumbnailPath] : [storagePath])
    } catch (cleanupError) {
      console.error(
        '[/api/attachments/finalize] Failed to clean up failed attachment:',
        cleanupError,
      )
      return NextResponse.json(
        { error: 'アップロード済みファイルの削除に失敗しました' },
        { status: 500 },
      )
    }
    if (err instanceof Error && err.message === PAID_STORAGE_ENTITLEMENT_ERROR) {
      return NextResponse.json(
        { error: '無料容量を超えて保存するには、残高のある有効な支援が必要です' },
        { status: 403 },
      )
    }
    if (err instanceof Error && err.message === UPLOAD_REQUEST_EXPIRED_ERROR) {
      return NextResponse.json({ error: 'アップロードURLの有効期限が切れました' }, { status: 410 })
    }
    console.error('[/api/attachments/finalize] DB insert failed:', err)
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 })
  }
}
