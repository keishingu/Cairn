// Copyright 2026 Cairn Contributors
// SPDX-License-Identifier: Apache-2.0

import { NextResponse } from 'next/server'
import { getAuthContext } from '@/lib/get-auth-context'
import { resolveUploadEntitlements } from '@/lib/billing/entitlements'
import { requireProjectAccess } from '@/lib/permissions'
import { recordStorageUsageDelta } from '@/lib/billing/storage-usage'
import {
  GALLERY_BUCKET,
  GALLERY_ORIGINALS_BUCKET,
  isGalleryImageMimeType,
  isGalleryStoragePath,
} from '@/lib/gallery-upload'
import { createServiceRoleClient } from '@/lib/supabase/service'

type RouteContext = { params: Promise<{ id: string }> }

interface FinalizeBody {
  fileName?: unknown
  originalMimeType?: unknown
  derivedMimeType?: unknown
  originalStoragePath?: unknown
  derivedStoragePath?: unknown
  takenAt?: unknown
  latitude?: unknown
  longitude?: unknown
}

interface StorageObject {
  size: number
}

async function readStorageObject(bucket: string, storagePath: string): Promise<StorageObject | null> {
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

  if (
    typeof body.fileName !== 'string' ||
    typeof body.derivedMimeType !== 'string' ||
    typeof body.derivedStoragePath !== 'string' ||
    (body.originalStoragePath !== undefined &&
      body.originalStoragePath !== null &&
      typeof body.originalStoragePath !== 'string') ||
    (body.originalMimeType !== undefined &&
      body.originalMimeType !== null &&
      typeof body.originalMimeType !== 'string')
  ) {
    return NextResponse.json({ error: 'アップロード確定情報が不正です' }, { status: 400 })
  }
  if (!isGalleryImageMimeType(body.derivedMimeType)) {
    return NextResponse.json({ error: '対応していない画像形式です' }, { status: 400 })
  }
  if (!isGalleryStoragePath(body.derivedStoragePath, ctx.workspaceId, projectId, 'derived')) {
    return NextResponse.json({ error: '不正な圧縮版の保存先です' }, { status: 400 })
  }
  if (
    body.originalStoragePath &&
    !isGalleryStoragePath(body.originalStoragePath, ctx.workspaceId, projectId, 'original')
  ) {
    return NextResponse.json({ error: '不正なオリジナルの保存先です' }, { status: 400 })
  }
  if (
    body.originalStoragePath &&
    (!body.originalMimeType || !isGalleryImageMimeType(body.originalMimeType))
  ) {
    return NextResponse.json({ error: '対応していないオリジナル画像形式です' }, { status: 400 })
  }

  // 型検証後にローカル定数へ固定する。transaction のクロージャ内でも型を安全に保つため。
  const fileName = body.fileName
  const derivedMimeType = body.derivedMimeType
  const derivedStoragePath = body.derivedStoragePath
  const originalStoragePath = body.originalStoragePath ?? null
  const originalMimeType = body.originalMimeType ?? null

  try {
    const { db, files, galleryItems, projects } = await import('@cairn/db')
    const { and, eq } = await import('drizzle-orm')
    const [project] = await db
      .select({ id: projects.id })
      .from(projects)
      .where(and(eq(projects.id, projectId), eq(projects.workspaceId, ctx.workspaceId)))
      .limit(1)
    if (!project) return new NextResponse(null, { status: 404 })

    const forbidden = await requireProjectAccess(ctx.workspaceId, ctx.userId, projectId, ctx.role)
    if (forbidden) return forbidden

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
    const [insertedItem, insertedFile] = await (async () => {
      try {
        return await db.transaction(async (tx) => {
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
          return [item, file] as const
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

    const supabase = createServiceRoleClient()
    const {
      data: { publicUrl },
    } = supabase.storage.from(GALLERY_BUCKET).getPublicUrl(derivedStoragePath)
    return NextResponse.json(
      {
        id: insertedItem.id,
        fileId: insertedFile.id,
        publicUrl,
        takenAt: insertedItem.takenAt?.toISOString() ?? null,
        createdAt: insertedItem.createdAt.toISOString(),
      },
      { status: 201 },
    )
  } catch (err) {
    console.error('[/api/projects/[id]/gallery/finalize POST]', err)
    return NextResponse.json({ error: 'アップロードの確定に失敗しました' }, { status: 500 })
  }
}
