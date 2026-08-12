// Copyright 2026 Cairn Contributors
// SPDX-License-Identifier: Apache-2.0

import { NextResponse } from 'next/server'
import {
  ALLOWED_MIME_TYPES,
  FREE_ATTACHMENT_MAX_FILE_SIZE,
  MAX_FILE_SIZE,
  normalizeMimeType,
  resolveStorageExtension,
} from '@/lib/attachments'
import { getAuthContext } from '@/lib/get-auth-context'
import { resolveUploadEntitlements } from '@/lib/billing/entitlements'
import { requireChannelAccess } from '@/lib/permissions'
import { createServiceRoleClient } from '@/lib/supabase/service'
import { ATTACHMENTS_BUCKET } from '@/lib/attachments/thumbnail'
import { UPLOAD_REQUEST_EXPIRY_MS } from '@/lib/gallery-upload'
import { lockActiveMembership } from '@/lib/access/active-membership-lock'

// ファイル本体を Vercel の Function 経由で受け取ると 4.5MB のリクエストボディ上限
// (FUNCTION_PAYLOAD_TOO_LARGE) に阻まれる。そこでメタデータだけを受け取り、
// Supabase Storage への署名付きアップロード URL を発行してクライアントから直接
// アップロードさせる。バリデーション(権限・MIME・サイズ)はここで行い、
// Storage バケット側の file_size_limit / allowed_mime_types でも二重に担保する。
export async function POST(req: Request) {
  const { ctx, error } = await getAuthContext()
  if (error) return error

  let body: { channelId?: unknown; fileName?: unknown; mimeType?: unknown; fileSize?: unknown }
  try {
    body = await req.json()
  } catch {
    return NextResponse.json({ error: 'Invalid JSON' }, { status: 400 })
  }

  const { channelId, fileName, mimeType, fileSize } = body
  if (
    typeof channelId !== 'string' ||
    typeof fileName !== 'string' ||
    typeof mimeType !== 'string' ||
    typeof fileSize !== 'number'
  ) {
    return NextResponse.json(
      { error: 'channelId・fileName・mimeType・fileSize は必須です' },
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

  if (fileSize > MAX_FILE_SIZE) {
    return NextResponse.json({ error: 'ファイルサイズは 10MB 以下にしてください' }, { status: 400 })
  }

  const forbidden = await requireChannelAccess(ctx.workspaceId, ctx.userId, channelId, ctx.role)
  if (forbidden) return forbidden

  const entitlements = await resolveUploadEntitlements(ctx.workspaceId, ctx.userId)
  if (fileSize > FREE_ATTACHMENT_MAX_FILE_SIZE && !entitlements.rights.canUploadLargeFile) {
    return NextResponse.json(
      { error: '5MBを超えるファイルをアップロードするには、残高のある有効な支援が必要です' },
      { status: 403 },
    )
  }

  const ext = resolveStorageExtension(fileName, normalizedMime)
  // 未finalizeのオブジェクトも退会時に本人単位で列挙できるよう、userIdで名前空間化する。
  const storagePath = `${ctx.workspaceId}/${channelId}/${ctx.userId}/${crypto.randomUUID()}.${ext}`

  const { db, uploadRequests } = await import('@cairn/db')
  const uploadRequest = await db.transaction(async (tx) => {
    if (!(await lockActiveMembership(tx, ctx.workspaceId, ctx.userId))) return null
    const [request] = await tx
      .insert(uploadRequests)
      .values({
        workspaceId: ctx.workspaceId,
        projectId: null,
        requestedBy: ctx.userId,
        fileName,
        derivedMimeType: normalizedMime,
        derivedStoragePath: storagePath,
        storageBucket: ATTACHMENTS_BUCKET,
        expiresAt: new Date(Date.now() + UPLOAD_REQUEST_EXPIRY_MS),
      })
      .returning({ id: uploadRequests.id })
    if (!request) throw new Error('upload request insert returned no rows')
    return request
  })
  if (!uploadRequest) {
    return NextResponse.json({ error: 'ワークスペースへのアクセス権がありません' }, { status: 403 })
  }

  const supabase = createServiceRoleClient()
  const { data, error: signError } = await supabase.storage
    .from(ATTACHMENTS_BUCKET)
    .createSignedUploadUrl(storagePath)

  if (signError || !data) {
    const { eq } = await import('drizzle-orm')
    await db.delete(uploadRequests).where(eq(uploadRequests.id, uploadRequest.id))
    console.error('[/api/attachments/upload-url] createSignedUploadUrl failed:', signError)
    return NextResponse.json({ error: 'アップロードURLの発行に失敗しました' }, { status: 500 })
  }

  return NextResponse.json({
    token: data.token,
    path: data.path,
    storagePath,
    mimeType: normalizedMime,
  })
}
