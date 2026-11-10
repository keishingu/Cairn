// Copyright 2026 Cairn Contributors
// SPDX-License-Identifier: Apache-2.0

import { NextResponse } from 'next/server'
import { z } from 'zod'
import { getAuthContext } from '@/lib/get-auth-context'
import { resolveUploadEntitlements } from '@/lib/billing/entitlements'
import {
  assertOriginalStorageAllowed,
  ORIGINAL_UPLOAD_ENTITLEMENT_ERROR,
} from '@/lib/billing/original-storage'
import { recordStorageUsageDelta } from '@/lib/billing/storage-usage'
import { ATTACHMENTS_BUCKET } from '@/lib/attachments/thumbnail'
import {
  extensionForFile,
  GALLERY_BUCKET,
  GALLERY_ORIGINALS_BUCKET,
  galleryStoragePath,
  isGalleryImageMimeType,
} from '@/lib/gallery-upload'
import {
  createGalleryDerivedImage,
  GALLERY_DERIVED_EXTENSION,
  GALLERY_DERIVED_MIME_TYPE,
  GALLERY_FROM_MESSAGE_MAX,
  readImageCaptureMetadata,
} from '@/lib/gallery-from-chat'
import { requireChannelAccess, requireProjectAccess } from '@/lib/permissions'
import { createServiceRoleClient } from '@/lib/supabase/service'

type RouteContext = { params: Promise<{ messageId: string }> }

export type MessageGalleryStatusResponse = {
  projectId: string
  /** 既にこのプロジェクトのギャラリーへ追加済みの添付（files.id） */
  addedFileIds: string[]
}

export type MessageGalleryAddResponse = {
  projectId: string
  /** 今回ギャラリーに追加した枚数 */
  addedCount: number
  /** すでに同じプロジェクトのギャラリーに追加済みだった枚数 */
  alreadyAddedCount: number
}

const bodySchema = z.object({
  // メッセージの添付（files.id）。同じ添付を二重に送っても1枚として扱う
  fileIds: z.array(z.string().uuid()).min(1).max(GALLERY_FROM_MESSAGE_MAX),
})

const DUPLICATE_ERROR = 'gallery-item-already-added'

// メッセージの取得と、チャンネル・プロジェクト両方の参加権限の確認。GET / POST 共通。
async function loadAuthorizedProjectMessage(messageId: string) {
  const { ctx, error: authError } = await getAuthContext()
  if (authError) return { error: authError }

  const { db, channels, messages } = await import('@cairn/db')
  const { and, eq, isNull } = await import('drizzle-orm')
  const [message] = await db
    .select({
      id: messages.id,
      messageType: messages.messageType,
      channelId: messages.channelId,
      projectId: channels.projectId,
    })
    .from(messages)
    .innerJoin(channels, eq(messages.channelId, channels.id))
    .where(and(
      eq(messages.id, messageId),
      eq(channels.workspaceId, ctx.workspaceId),
      isNull(messages.deletedAt),
    ))
    .limit(1)
  if (!message || message.messageType === 'system') {
    return { error: NextResponse.json({ error: 'メッセージが見つかりません' }, { status: 404 }) }
  }

  const channelForbidden = await requireChannelAccess(ctx.workspaceId, ctx.userId, message.channelId, ctx.role)
  if (channelForbidden) return { error: channelForbidden }

  const projectId = message.projectId
  if (!projectId) {
    return {
      error: NextResponse.json(
        { error: 'プロジェクトのチャンネルの画像だけをギャラリーに追加できます' },
        { status: 400 },
      ),
    }
  }
  const projectForbidden = await requireProjectAccess(ctx.workspaceId, ctx.userId, projectId, ctx.role)
  if (projectForbidden) return { error: projectForbidden }

  return { ctx, projectId }
}

// このメッセージの添付のうち、既にプロジェクトのギャラリーへ追加済みのもの（files.id）を返す。
export async function GET(_req: Request, { params }: RouteContext) {
  const { messageId } = await params
  try {
    const loaded = await loadAuthorizedProjectMessage(messageId)
    if ('error' in loaded) return loaded.error
    const { projectId } = loaded

    const { db, galleryItems, messageAttachments } = await import('@cairn/db')
    const { and, eq, sql } = await import('drizzle-orm')
    const rows = await db
      .select({ fileId: messageAttachments.fileId })
      .from(messageAttachments)
      .innerJoin(
        galleryItems,
        and(
          eq(galleryItems.projectId, projectId),
          sql`${galleryItems.metadata}->>'sourceFileId' = ${messageAttachments.fileId}::text`,
        ),
      )
      .where(eq(messageAttachments.messageId, messageId))

    const body: MessageGalleryStatusResponse = {
      projectId,
      addedFileIds: [...new Set(rows.map(row => row.fileId))],
    }
    return NextResponse.json(body)
  } catch (err) {
    console.error('[/api/messages/[messageId]/gallery GET]', err)
    return NextResponse.json({ error: 'ギャラリーへの追加状況を取得できませんでした' }, { status: 500 })
  }
}

/** ギャラリー項目の metadata に残す追加元。重複追加の判定にも使う */
export type GalleryItemChatSource = {
  sourceMessageId: string
  sourceFileId: string
}

/**
 * チャットに添付された画像を、そのチャンネルのプロジェクトのギャラリーへコピーする。
 * チャット側の添付はそのまま残す（ギャラリーの項目とはファイルを共有しない。
 * 共有するとファイル一覧からギャラリー分として除外され、公開バケットへの配信にもなるため）。
 * 追加元のチャンネルには既に同じ画像が流れているので、ギャラリー追加の更新通知は投稿しない。
 */
export async function POST(req: Request, { params }: RouteContext) {
  const { messageId } = await params

  try {
    const loaded = await loadAuthorizedProjectMessage(messageId)
    if ('error' in loaded) return loaded.error
    const { ctx, projectId } = loaded

    let parsed: z.infer<typeof bodySchema>
    try {
      const result = bodySchema.safeParse(await req.json())
      if (!result.success) {
        return NextResponse.json({ error: '追加する画像の指定が不正です' }, { status: 400 })
      }
      parsed = result.data
    } catch {
      return NextResponse.json({ error: 'リクエスト形式が不正です' }, { status: 400 })
    }
    const requestedFileIds = [...new Set(parsed.fileIds)]
    const { db, files, galleryItems, messageAttachments } = await import('@cairn/db')
    const { and, eq, inArray, sql } = await import('drizzle-orm')

    const attachments = await db
      .select({
        fileId: files.id,
        fileName: files.fileName,
        mimeType: files.mimeType,
        storagePath: files.storagePath,
      })
      .from(messageAttachments)
      .innerJoin(files, eq(messageAttachments.fileId, files.id))
      .where(and(
        eq(messageAttachments.messageId, messageId),
        eq(files.workspaceId, ctx.workspaceId),
        inArray(files.id, requestedFileIds),
      ))
    const byId = new Map(attachments.map(row => [row.fileId, row]))
    const targets = requestedFileIds.map(id => byId.get(id))
    if (targets.some(row => !row)) {
      return NextResponse.json({ error: '指定した画像がこのメッセージに見つかりません' }, { status: 404 })
    }
    const images = targets.filter((row): row is NonNullable<typeof row> => row !== undefined)
    if (images.some(row => !row.mimeType || !isGalleryImageMimeType(row.mimeType))) {
      return NextResponse.json({ error: '画像以外のファイルはギャラリーに追加できません' }, { status: 400 })
    }
    if (images.some(row => !row.storagePath)) {
      return NextResponse.json({ error: '画像の本体が見つからないため、ギャラリーに追加できません' }, { status: 409 })
    }

    // 追加済みの画像は Storage を読む前に除く（重い処理と無駄なコピーを避ける）
    const existingRows = await db
      .select({ sourceFileId: sql<string>`${galleryItems.metadata}->>'sourceFileId'` })
      .from(galleryItems)
      .where(and(
        eq(galleryItems.projectId, projectId),
        inArray(sql`${galleryItems.metadata}->>'sourceFileId'`, images.map(row => row.fileId)),
      ))
    const alreadyAdded = new Set(existingRows.map(row => row.sourceFileId))
    const pending = images.filter(row => !alreadyAdded.has(row.fileId))

    const entitlements = pending.length > 0
      ? await resolveUploadEntitlements(ctx.workspaceId, ctx.userId)
      : null
    const keepOriginal = entitlements?.rights.canUploadOriginal ?? false

    const supabase = createServiceRoleClient()
    let addedCount = 0
    let alreadyAddedCount = alreadyAdded.size

    for (const image of pending) {
      const { data: blob, error: downloadError } = await supabase.storage
        .from(ATTACHMENTS_BUCKET)
        .download(image.storagePath!)
      if (downloadError || !blob) {
        throw new Error(`Failed to download chat attachment: ${downloadError?.message ?? 'empty body'}`)
      }
      const original = Buffer.from(await blob.arrayBuffer())
      const [derived, capture] = await Promise.all([
        createGalleryDerivedImage(original),
        readImageCaptureMetadata(original),
      ])

      const derivedStoragePath = galleryStoragePath(ctx.workspaceId, projectId, 'derived', GALLERY_DERIVED_EXTENSION)
      const originalStoragePath = keepOriginal
        ? galleryStoragePath(ctx.workspaceId, projectId, 'original', extensionForFile(image.fileName, image.mimeType!))
        : null

      const removeUploaded = async () => {
        const results = await Promise.all([
          supabase.storage.from(GALLERY_BUCKET).remove([derivedStoragePath]),
          originalStoragePath
            ? supabase.storage.from(GALLERY_ORIGINALS_BUCKET).remove([originalStoragePath])
            : Promise.resolve({ error: null }),
        ])
        for (const result of results) {
          if (result.error) console.error('[/api/messages/[messageId]/gallery] cleanup failed:', result.error)
        }
      }

      const [derivedUpload, originalUpload] = await Promise.all([
        supabase.storage
          .from(GALLERY_BUCKET)
          .upload(derivedStoragePath, derived, { contentType: GALLERY_DERIVED_MIME_TYPE }),
        originalStoragePath
          ? supabase.storage
            .from(GALLERY_ORIGINALS_BUCKET)
            .upload(originalStoragePath, original, { contentType: image.mimeType! })
          : Promise.resolve({ error: null }),
      ])
      if (derivedUpload.error || originalUpload.error) {
        await removeUploaded()
        throw new Error(
          `Failed to upload gallery copy: ${derivedUpload.error?.message ?? originalUpload.error?.message}`,
        )
      }

      try {
        await db.transaction(async (tx) => {
          // 連打・並行リクエストで同じ添付を二重に追加しないよう、追加元ごとに直列化する
          await tx.execute(
            sql`SELECT pg_advisory_xact_lock(hashtextextended(${`gallery-from-chat:${projectId}:${image.fileId}`}, 0))`,
          )
          const [duplicate] = await tx
            .select({ id: galleryItems.id })
            .from(galleryItems)
            .where(and(
              eq(galleryItems.projectId, projectId),
              sql`${galleryItems.metadata}->>'sourceFileId' = ${image.fileId}`,
            ))
            .limit(1)
          if (duplicate) throw new Error(DUPLICATE_ERROR)

          if (originalStoragePath) {
            await assertOriginalStorageAllowed(tx, ctx.workspaceId, ctx.userId)
          }

          const [file] = await tx
            .insert(files)
            .values({
              workspaceId: ctx.workspaceId,
              projectId,
              uploadedBy: ctx.userId,
              storagePath: originalStoragePath,
              derivedStoragePath,
              fileName: image.fileName,
              mimeType: originalStoragePath ? image.mimeType : GALLERY_DERIVED_MIME_TYPE,
              derivedMimeType: GALLERY_DERIVED_MIME_TYPE,
              fileSize: originalStoragePath ? original.byteLength : null,
              derivedFileSize: derived.byteLength,
              fileType: 'image',
            })
            .returning({ id: files.id })
          if (!file) throw new Error('files insert returned no rows')

          const source: GalleryItemChatSource = { sourceMessageId: messageId, sourceFileId: image.fileId }
          await tx.insert(galleryItems).values({
            projectId,
            uploadedBy: ctx.userId,
            fileId: file.id,
            takenAt: capture.takenAt,
            latitude: capture.latitude === null ? null : capture.latitude.toFixed(7),
            longitude: capture.longitude === null ? null : capture.longitude.toFixed(7),
            metadata: source,
          })

          await recordStorageUsageDelta(
            ctx.workspaceId,
            {
              originalBytes: originalStoragePath ? original.byteLength : 0,
              derivedBytes: derived.byteLength,
            },
            tx,
          )
        })
        addedCount += 1
      } catch (transactionError) {
        await removeUploaded()
        if (transactionError instanceof Error && transactionError.message === DUPLICATE_ERROR) {
          alreadyAddedCount += 1
          continue
        }
        throw transactionError
      }
    }

    const body: MessageGalleryAddResponse = { projectId, addedCount, alreadyAddedCount }
    return NextResponse.json(body, { status: addedCount > 0 ? 201 : 200 })
  } catch (err) {
    if (err instanceof Error && err.message === ORIGINAL_UPLOAD_ENTITLEMENT_ERROR) {
      return NextResponse.json(
        { error: 'オリジナルを保存するには、残高のある有効な支援が必要です' },
        { status: 403 },
      )
    }
    console.error('[/api/messages/[messageId]/gallery POST]', err)
    return NextResponse.json({ error: 'ギャラリーへの追加に失敗しました' }, { status: 500 })
  }
}
