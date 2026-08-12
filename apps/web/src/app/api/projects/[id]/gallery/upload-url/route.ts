// Copyright 2026 Cairn Contributors
// SPDX-License-Identifier: Apache-2.0

import { NextResponse } from 'next/server'
import { getAuthContext } from '@/lib/get-auth-context'
import { requireProjectAccess } from '@/lib/permissions'
import { resolveUploadEntitlements } from '@/lib/billing/entitlements'
import {
  extensionForFile,
  galleryStoragePath,
  GALLERY_BUCKET,
  GALLERY_ORIGINALS_BUCKET,
  UPLOAD_REQUEST_EXPIRY_MS,
  UPLOAD_REQUEST_EXPIRY_SAFETY_MS,
  UPLOAD_REQUEST_FALLBACK_EXPIRY_MS,
  isGalleryImageMimeType,
} from '@/lib/gallery-upload'
import { createServiceRoleClient } from '@/lib/supabase/service'
import { lockActiveMembership } from '@/lib/access/active-membership-lock'
import { hasAttachmentUploadRequestSchema } from '@/lib/uploads/schema-readiness'

type RouteContext = { params: Promise<{ id: string }> }

interface UploadMetadata {
  fileName: string
  mimeType: string
}

function isUploadMetadata(value: unknown): value is UploadMetadata {
  if (!value || typeof value !== 'object') return false
  const candidate = value as Record<string, unknown>
  return typeof candidate['fileName'] === 'string' && typeof candidate['mimeType'] === 'string'
}

export async function POST(req: Request, { params }: RouteContext) {
  const { id: projectId } = await params
  const { ctx, error } = await getAuthContext()
  if (error) return error

  let body: { original?: unknown; derived?: unknown }
  try {
    body = await req.json()
  } catch {
    return NextResponse.json({ error: 'リクエスト形式が不正です' }, { status: 400 })
  }

  if (!isUploadMetadata(body.original) || !isUploadMetadata(body.derived)) {
    return NextResponse.json(
      { error: 'original・derived のファイル情報は必須です' },
      { status: 400 },
    )
  }
  const originalMetadata = body.original
  const derivedMetadata = body.derived
  if (!isGalleryImageMimeType(derivedMetadata.mimeType)) {
    return NextResponse.json({ error: '対応していない圧縮版の画像形式です' }, { status: 400 })
  }

  try {
    const { db, projects, uploadRequests } = await import('@cairn/db')
    const { and, eq } = await import('drizzle-orm')
    const [project] = await db
      .select({ id: projects.id })
      .from(projects)
      .where(and(eq(projects.id, projectId), eq(projects.workspaceId, ctx.workspaceId)))
      .limit(1)
    if (!project) return new NextResponse(null, { status: 404 })

    const forbidden = await requireProjectAccess(ctx.workspaceId, ctx.userId, projectId, ctx.role)
    if (forbidden) return forbidden

    const entitlements = await resolveUploadEntitlements(ctx.workspaceId, ctx.userId)
    if (
      entitlements.rights.canUploadOriginal &&
      !isGalleryImageMimeType(originalMetadata.mimeType)
    ) {
      return NextResponse.json({ error: '対応していないオリジナル画像形式です' }, { status: 400 })
    }
    const derivedStoragePath = galleryStoragePath(
      ctx.workspaceId,
      projectId,
      'derived',
      extensionForFile(derivedMetadata.fileName, derivedMetadata.mimeType),
    )
    const originalStoragePath = entitlements.rights.canUploadOriginal
      ? galleryStoragePath(
          ctx.workspaceId,
          projectId,
          'original',
          extensionForFile(originalMetadata.fileName, originalMetadata.mimeType),
        )
      : null

    if (!(await hasAttachmentUploadRequestSchema(db))) {
      return NextResponse.json(
        { error: 'アップロード機能を更新中です。少し待ってから再試行してください' },
        { status: 503 },
      )
    }

    const expiresAt = new Date(Date.now() + UPLOAD_REQUEST_FALLBACK_EXPIRY_MS)
    const [uploadRequest] = await db.transaction(async (tx) => {
      if (!(await lockActiveMembership(tx, ctx.workspaceId, ctx.userId))) return []
      return tx
        .insert(uploadRequests)
        .values({
          workspaceId: ctx.workspaceId,
          projectId,
          requestedBy: ctx.userId,
          fileName: originalMetadata.fileName,
          derivedMimeType: derivedMetadata.mimeType,
          originalMimeType: originalStoragePath ? originalMetadata.mimeType : null,
          derivedStoragePath,
          originalStoragePath,
          expiresAt,
        })
        .returning({ id: uploadRequests.id })
    })
    if (!uploadRequest) {
      return NextResponse.json(
        { error: 'ワークスペースへのアクセス権がありません' },
        { status: 403 },
      )
    }

    const supabase = createServiceRoleClient()
    const [{ data: derived, error: derivedError }, originalResult] = await Promise.all([
      supabase.storage.from(GALLERY_BUCKET).createSignedUploadUrl(derivedStoragePath),
      originalStoragePath
        ? supabase.storage.from(GALLERY_ORIGINALS_BUCKET).createSignedUploadUrl(originalStoragePath)
        : Promise.resolve({ data: null, error: null }),
    ])
    if (
      derivedError ||
      !derived ||
      originalResult.error ||
      (originalStoragePath && !originalResult.data)
    ) {
      await db.delete(uploadRequests).where(eq(uploadRequests.id, uploadRequest.id))
      console.error('[/api/projects/[id]/gallery/upload-url] createSignedUploadUrl failed:', {
        derivedError,
        originalError: originalResult.error,
      })
      return NextResponse.json({ error: 'アップロードURLの発行に失敗しました' }, { status: 500 })
    }

    await db
      .update(uploadRequests)
      .set({
        expiresAt: new Date(
          Date.now() + UPLOAD_REQUEST_EXPIRY_MS + UPLOAD_REQUEST_EXPIRY_SAFETY_MS,
        ),
      })
      .where(eq(uploadRequests.id, uploadRequest.id))

    return NextResponse.json({
      uploadId: uploadRequest.id,
      derived: {
        bucket: GALLERY_BUCKET,
        token: derived.token,
        path: derived.path,
        storagePath: derivedStoragePath,
      },
      original:
        originalStoragePath && originalResult.data
          ? {
              bucket: GALLERY_ORIGINALS_BUCKET,
              token: originalResult.data.token,
              path: originalResult.data.path,
              storagePath: originalStoragePath,
            }
          : null,
      workspaceState: entitlements.workspaceState,
    })
  } catch (err) {
    console.error('[/api/projects/[id]/gallery/upload-url POST]', err)
    return NextResponse.json({ error: 'アップロードURLの発行に失敗しました' }, { status: 500 })
  }
}
