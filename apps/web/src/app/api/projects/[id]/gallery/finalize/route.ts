// Copyright 2026 Cairn Contributors
// SPDX-License-Identifier: Apache-2.0

import { NextResponse } from 'next/server'
import { getAuthContext } from '@/lib/get-auth-context'
import { resolveUploadEntitlements } from '@/lib/billing/entitlements'
import { isBillingEnabled } from '@/lib/billing/is-billing-enabled'
import { requireProjectAccess } from '@/lib/permissions'
import { recordStorageUsageDelta } from '@/lib/billing/storage-usage'
import { GALLERY_BUCKET, GALLERY_ORIGINALS_BUCKET } from '@/lib/gallery-upload'
import { createServiceRoleClient } from '@/lib/supabase/service'

type RouteContext = { params: Promise<{ id: string }> }

interface FinalizeBody {
  uploadId?: unknown
  takenAt?: unknown
  latitude?: unknown
  longitude?: unknown
}

interface StorageObject {
  size: number
}

const ORIGINAL_UPLOAD_ENTITLEMENT_ERROR = 'original-upload-entitlement-required'

async function readStorageObject(
  bucket: string,
  storagePath: string,
): Promise<StorageObject | null> {
  const slash = storagePath.lastIndexOf('/')
  const folder = storagePath.slice(0, slash)
  const objectName = storagePath.slice(slash + 1)
  const supabase = createServiceRoleClient()
  const { data, error } = await supabase.storage.from(bucket).list(folder, { search: objectName })
  if (error) throw error
  const object = data?.find((item) => item.name === objectName)
  const size = object?.metadata?.['size']
  return typeof size === 'number' ? { size } : null
}

export async function POST(req: Request, { params }: RouteContext) {
  const { id: projectId } = await params
  const { ctx, error } = await getAuthContext()
  if (error) return error

  let body: FinalizeBody
  try {
    body = await req.json()
  } catch {
    return NextResponse.json({ error: 'リクエスト形式が不正です' }, { status: 400 })
  }

  if (typeof body.uploadId !== 'string') {
    return NextResponse.json({ error: 'アップロード確定情報が不正です' }, { status: 400 })
  }

  // 型検証後にローカル定数へ固定する。transaction のクロージャ内でも型を安全に保つため。
  const uploadId = body.uploadId

  try {
    const { creditLedger, db, files, galleryItems, projects, subscriptions, uploadRequests } =
      await import('@cairn/db')
    const { and, eq, gt, or, sql } = await import('drizzle-orm')
    const [project] = await db
      .select({ id: projects.id })
      .from(projects)
      .where(and(eq(projects.id, projectId), eq(projects.workspaceId, ctx.workspaceId)))
      .limit(1)
    if (!project) return new NextResponse(null, { status: 404 })

    const forbidden = await requireProjectAccess(ctx.workspaceId, ctx.userId, projectId, ctx.role)
    if (forbidden) return forbidden

    const [request] = await db
      .select({
        id: uploadRequests.id,
        fileName: uploadRequests.fileName,
        derivedMimeType: uploadRequests.derivedMimeType,
        originalMimeType: uploadRequests.originalMimeType,
        derivedStoragePath: uploadRequests.derivedStoragePath,
        originalStoragePath: uploadRequests.originalStoragePath,
        expiresAt: uploadRequests.expiresAt,
        finalizedAt: uploadRequests.finalizedAt,
        fileId: uploadRequests.fileId,
      })
      .from(uploadRequests)
      .where(
        and(
          eq(uploadRequests.id, uploadId),
          eq(uploadRequests.workspaceId, ctx.workspaceId),
          eq(uploadRequests.projectId, projectId),
          eq(uploadRequests.requestedBy, ctx.userId),
        ),
      )
      .limit(1)
    if (!request) {
      return NextResponse.json(
        { error: 'アップロードの有効期限が切れたか、見つかりません' },
        { status: 404 },
      )
    }

    const derivedStoragePath = request.derivedStoragePath
    const originalStoragePath = request.originalStoragePath
    const fileName = request.fileName
    const derivedMimeType = request.derivedMimeType
    const originalMimeType = request.originalMimeType

    const toResponse = async (fileId: string, status: 200 | 201) => {
      const [item] = await db
        .select({
          id: galleryItems.id,
          takenAt: galleryItems.takenAt,
          createdAt: galleryItems.createdAt,
        })
        .from(galleryItems)
        .where(eq(galleryItems.fileId, fileId))
        .limit(1)
      if (!item) {
        return NextResponse.json(
          { error: '確定済みアップロードの情報が見つかりません' },
          { status: 409 },
        )
      }
      const supabase = createServiceRoleClient()
      const {
        data: { publicUrl },
      } = supabase.storage.from(GALLERY_BUCKET).getPublicUrl(derivedStoragePath)
      return NextResponse.json(
        {
          id: item.id,
          fileId,
          publicUrl,
          takenAt: item.takenAt?.toISOString() ?? null,
          createdAt: item.createdAt.toISOString(),
        },
        { status },
      )
    }

    if (request.finalizedAt && request.fileId) return toResponse(request.fileId, 200)

    if (request.expiresAt <= new Date()) {
      const supabase = createServiceRoleClient()
      const [{ error: derivedError }, originalResult] = await Promise.all([
        supabase.storage.from(GALLERY_BUCKET).remove([derivedStoragePath]),
        originalStoragePath
          ? supabase.storage.from(GALLERY_ORIGINALS_BUCKET).remove([originalStoragePath])
          : Promise.resolve({ error: null }),
      ])
      if (derivedError || originalResult.error) {
        console.error('[/api/projects/[id]/gallery/finalize] expired upload cleanup failed:', {
          derivedError,
          originalError: originalResult.error,
        })
        return NextResponse.json(
          { error: '期限切れアップロードの削除に失敗しました' },
          { status: 500 },
        )
      }
      await db.delete(uploadRequests).where(eq(uploadRequests.id, request.id))
      return NextResponse.json({ error: 'アップロードURLの有効期限が切れました' }, { status: 410 })
    }

    // 署名付きURLの発行後に残高・購読状態が変わる可能性があるため、原本を登録する直前にも再確認する。
    if (originalStoragePath) {
      const entitlements = await resolveUploadEntitlements(ctx.workspaceId, ctx.userId)
      if (!entitlements.rights.canUploadOriginal) {
        return NextResponse.json(
          { error: 'オリジナルを保存するには、残高のある有効な支援が必要です' },
          { status: 403 },
        )
      }
    }

    const [derived, original] = await Promise.all([
      readStorageObject(GALLERY_BUCKET, derivedStoragePath),
      originalStoragePath
        ? readStorageObject(GALLERY_ORIGINALS_BUCKET, originalStoragePath)
        : Promise.resolve(null),
    ])
    if (!derived || (originalStoragePath && !original)) {
      return NextResponse.json(
        { error: 'アップロードされたファイルが見つかりません' },
        { status: 400 },
      )
    }

    const takenAt = typeof body.takenAt === 'string' ? new Date(body.takenAt) : null
    const latitude = typeof body.latitude === 'string' ? body.latitude : null
    const longitude = typeof body.longitude === 'string' ? body.longitude : null
    const finalized = await (async () => {
      try {
        return await db.transaction(async (tx) => {
          const [lockedRequest] = await tx
            .select({
              id: uploadRequests.id,
              fileName: uploadRequests.fileName,
              derivedMimeType: uploadRequests.derivedMimeType,
              originalMimeType: uploadRequests.originalMimeType,
              derivedStoragePath: uploadRequests.derivedStoragePath,
              originalStoragePath: uploadRequests.originalStoragePath,
              expiresAt: uploadRequests.expiresAt,
              finalizedAt: uploadRequests.finalizedAt,
              fileId: uploadRequests.fileId,
            })
            .from(uploadRequests)
            .where(
              and(
                eq(uploadRequests.id, uploadId),
                eq(uploadRequests.workspaceId, ctx.workspaceId),
                eq(uploadRequests.projectId, projectId),
                eq(uploadRequests.requestedBy, ctx.userId),
              ),
            )
            .for('update')
            .limit(1)
          if (!lockedRequest) throw new Error('upload request disappeared before finalization')
          if (lockedRequest.finalizedAt && lockedRequest.fileId) {
            return { fileId: lockedRequest.fileId, reused: true }
          }
          if (lockedRequest.expiresAt <= new Date()) {
            throw new Error('upload request expired before finalization')
          }

          if (originalStoragePath && isBillingEnabled()) {
            // 原本を登録する直前に、usage 行をロックして未請求家賃を精算した後の
            // 残高・支援状態を確認する。外側の事前判定だけには依存しない。
            const { settleWorkspaceStorageRent } = await import('@/lib/billing/storage-rent')
            await settleWorkspaceStorageRent(tx, ctx.workspaceId)
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
                    eq(subscriptions.status, 'active'),
                    gt(subscriptions.currentPeriodEnd, new Date()),
                    or(
                      and(
                        eq(subscriptions.plan, 'individual'),
                        eq(subscriptions.supporterUserId, ctx.userId),
                      ),
                      eq(subscriptions.plan, 'workspace'),
                    ),
                  ),
                )
                .limit(1),
            ])
            if (!subscription || Number(balance?.balance ?? 0) <= 0) {
              throw new Error(ORIGINAL_UPLOAD_ENTITLEMENT_ERROR)
            }
          }

          const [file] = await tx
            .insert(files)
            .values({
              workspaceId: ctx.workspaceId,
              projectId,
              uploadedBy: ctx.userId,
              storagePath: originalStoragePath,
              derivedStoragePath,
              fileName,
              mimeType: originalMimeType ?? derivedMimeType,
              derivedMimeType,
              fileSize: original?.size ?? null,
              derivedFileSize: derived.size,
              fileType: 'image',
            })
            .returning()
          if (!file) throw new Error('files insert returned no rows')

          const [item] = await tx
            .insert(galleryItems)
            .values({
              projectId,
              uploadedBy: ctx.userId,
              fileId: file.id,
              takenAt,
              latitude,
              longitude,
            })
            .returning()
          if (!item) throw new Error('gallery_items insert returned no rows')

          await recordStorageUsageDelta(
            ctx.workspaceId,
            {
              originalBytes: original?.size ?? 0,
              derivedBytes: derived.size,
            },
            tx,
          )
          await tx
            .update(uploadRequests)
            .set({ fileId: file.id, finalizedAt: new Date() })
            .where(eq(uploadRequests.id, lockedRequest.id))
          return { fileId: file.id, reused: false }
        })
      } catch (transactionError) {
        const supabase = createServiceRoleClient()
        await Promise.all([
          supabase.storage.from(GALLERY_BUCKET).remove([derivedStoragePath]),
          originalStoragePath
            ? supabase.storage.from(GALLERY_ORIGINALS_BUCKET).remove([originalStoragePath])
            : undefined,
        ])
        throw transactionError
      }
    })()

    return toResponse(finalized.fileId, finalized.reused ? 200 : 201)
  } catch (err) {
    if (err instanceof Error && err.message === ORIGINAL_UPLOAD_ENTITLEMENT_ERROR) {
      return NextResponse.json(
        { error: 'オリジナルを保存するには、残高のある有効な支援が必要です' },
        { status: 403 },
      )
    }
    console.error('[/api/projects/[id]/gallery/finalize POST]', err)
    return NextResponse.json({ error: 'アップロードの確定に失敗しました' }, { status: 500 })
  }
}
