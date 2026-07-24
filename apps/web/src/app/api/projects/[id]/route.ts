// Copyright 2026 Cairn Contributors
// SPDX-License-Identifier: Apache-2.0

import { NextResponse } from 'next/server'
import { patchProjectSchema } from '@cairn/shared'
import { getAuthContext } from '@/lib/get-auth-context'
import { requireRole } from '@/lib/permissions'

export async function DELETE(_req: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id: projectId } = await params

  const { ctx, error: authError } = await getAuthContext()
  if (authError) return authError

  try {
    const {
      db,
      projects,
      files,
      channels,
      messages,
      messageAttachments,
      galleryItems,
      uploadRequests,
    } = await import('@cairn/db')
    const { eq, and, inArray, isNull, or } = await import('drizzle-orm')

    const [project] = await db
      .select({ id: projects.id })
      .from(projects)
      .where(and(eq(projects.id, projectId), eq(projects.workspaceId, ctx.workspaceId)))
      .limit(1)

    if (!project) {
      return NextResponse.json({ error: 'Project not found' }, { status: 404 })
    }

    const forbidden = requireRole(ctx.role, 'admin')
    if (forbidden) return forbidden

    const deleted = await db.transaction(async (tx) => {
      // CASCADE の直前にプロジェクトをロックし、同じトランザクションで対象ファイルを
      // 集計・家賃精算する。日次 reconciliation まで古い使用量を請求し続けない。
      const [lockedProject] = await tx
        .select({ id: projects.id })
        .from(projects)
        .where(and(eq(projects.id, projectId), eq(projects.workspaceId, ctx.workspaceId)))
        .for('update')
        .limit(1)
      if (!lockedProject) return null

      // CASCADE 前にストレージパスを収集する。
      const filePaths = await tx
        .selectDistinct({
          storagePath: files.storagePath,
          derivedStoragePath: files.derivedStoragePath,
          id: files.id,
          projectId: files.projectId,
          fileSize: files.fileSize,
          derivedFileSize: files.derivedFileSize,
          metadata: files.metadata,
          galleryItemId: galleryItems.id,
        })
        .from(files)
        .leftJoin(messageAttachments, eq(messageAttachments.fileId, files.id))
        .leftJoin(messages, eq(messages.id, messageAttachments.messageId))
        .leftJoin(channels, eq(channels.id, messages.channelId))
        .leftJoin(galleryItems, eq(galleryItems.fileId, files.id))
        .where(or(eq(files.projectId, projectId), eq(channels.projectId, projectId)))

      // 未確定アップロードは files に現れないため、CASCADE 前に別途回収する。
      const pendingUploadPaths = await tx
        .select({
          derivedStoragePath: uploadRequests.derivedStoragePath,
          originalStoragePath: uploadRequests.originalStoragePath,
        })
        .from(uploadRequests)
        .where(and(eq(uploadRequests.projectId, projectId), isNull(uploadRequests.finalizedAt)))

      // gallery_items とのJOINで同じ files 行が複数現れ得るため、使用量は file ID ごとに
      // 一度だけ計上する。ストレージ削除対象の参照一覧は下でそのまま保持する。
      const uniqueFiles = [...new Map(filePaths.map((file) => [file.id, file])).values()]
      const { recordStorageUsageDelta } = await import('@/lib/billing/storage-usage')
      await recordStorageUsageDelta(
        ctx.workspaceId,
        {
          originalBytes: -uniqueFiles.reduce((total, file) => total + (file.fileSize ?? 0), 0),
          derivedBytes: -uniqueFiles.reduce((total, file) => total + (file.derivedFileSize ?? 0), 0),
        },
        tx,
      )

      const legacyFileIds = uniqueFiles
        .filter((file) => file.projectId === null)
        .map((file) => file.id)
      if (legacyFileIds.length > 0) {
        await tx.delete(files).where(inArray(files.id, legacyFileIds))
      }

      const [removedProject] = await tx
        .delete(projects)
        .where(and(eq(projects.id, projectId), eq(projects.workspaceId, ctx.workspaceId)))
        .returning({ id: projects.id })
      if (!removedProject) return null

      return { filePaths, pendingUploadPaths }
    })

    if (!deleted) return NextResponse.json({ error: 'Project not found' }, { status: 404 })

    const { filePaths, pendingUploadPaths } = deleted

    if (filePaths.length > 0 || pendingUploadPaths.length > 0) {
      // 添付のオリジナルに加えて、生成済みのサムネ(metadata.thumbnailPath)も削除対象に含める
      const attachmentPaths = filePaths
        .filter((f) => !f.galleryItemId)
        .flatMap((f) => {
          const meta = (f.metadata ?? {}) as Record<string, unknown>
          const thumbnailPath =
            typeof meta['thumbnailPath'] === 'string' ? meta['thumbnailPath'] : null
          return [f.storagePath, thumbnailPath].filter((path): path is string => path !== null)
        })
      const galleryDerivedPaths = [
        ...filePaths
          .filter((f) => f.galleryItemId)
          .flatMap((f) => [f.derivedStoragePath].filter((path): path is string => path !== null)),
        ...pendingUploadPaths.map((request) => request.derivedStoragePath),
      ]
      const galleryOriginalPaths = [
        ...filePaths
          .filter((f) => f.galleryItemId)
          .flatMap((f) => [f.storagePath].filter((path): path is string => path !== null)),
        ...pendingUploadPaths
          .map((request) => request.originalStoragePath)
          .filter((path): path is string => path !== null),
      ]
      const { inngest } = await import('@/lib/inngest/client')
      await Promise.all([
        attachmentPaths.length > 0
          ? inngest.send({
              name: 'storage/objects.delete',
              data: { bucket: 'chat-attachments', paths: attachmentPaths },
            })
          : undefined,
        galleryDerivedPaths.length > 0
          ? inngest.send({
              name: 'storage/objects.delete',
              data: { bucket: 'gallery', paths: galleryDerivedPaths },
            })
          : undefined,
        galleryOriginalPaths.length > 0
          ? inngest.send({
              name: 'storage/objects.delete',
              data: { bucket: 'gallery-originals', paths: galleryOriginalPaths },
            })
          : undefined,
      ])
    }

    return NextResponse.json({ success: true })
  } catch (err) {
    console.error('[DELETE /api/projects/[id]]', err)
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 })
  }
}

export async function PATCH(req: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params

  const { ctx, error: authError } = await getAuthContext()
  if (authError) return authError

  let body: unknown
  try {
    body = await req.json()
  } catch {
    return NextResponse.json({ error: 'Invalid JSON' }, { status: 400 })
  }

  const parsed = patchProjectSchema.safeParse(body)
  if (!parsed.success) {
    return NextResponse.json({ error: parsed.error.flatten() }, { status: 422 })
  }
  const b = parsed.data

  try {
    const { db } = await import('@cairn/db')
    const { projects, projectStatuses } = await import('@cairn/db')
    const { eq, and, isNull } = await import('drizzle-orm')

    const [project] = await db
      .select({ id: projects.id })
      .from(projects)
      .where(and(eq(projects.id, id), eq(projects.workspaceId, ctx.workspaceId)))
      .limit(1)

    if (!project) {
      return NextResponse.json({ error: 'Project not found' }, { status: 404 })
    }

    const forbidden = requireRole(ctx.role, 'member')
    if (forbidden) return forbidden

    let resolvedCoverPhotoUrl: string | null | undefined = undefined

    if (b.placePhotoName) {
      const { fetchAndStoreCoverFromPlace } = await import('@/lib/cover-photo')
      resolvedCoverPhotoUrl = await fetchAndStoreCoverFromPlace(b.placePhotoName)
    } else if ('coverPhotoUrl' in (b as object)) {
      resolvedCoverPhotoUrl = b.coverPhotoUrl ?? null
    }
    const set: {
      title?: string
      description?: string | null
      startDate?: string | null
      endDate?: string | null
      statusId?: string | null
      archived?: boolean
      coverPhotoUrl?: string | null
      location?: string | null
      placeId?: string | null
      updatedAt: Date
    } = { updatedAt: new Date() }

    if (b.title !== undefined) set.title = b.title
    if ('description' in b) set.description = b.description ?? null
    if ('startDate' in b) set.startDate = b.startDate ?? null
    if ('endDate' in b) set.endDate = b.endDate ?? null
    if (b.archived !== undefined) set.archived = b.archived
    if (resolvedCoverPhotoUrl !== undefined) set.coverPhotoUrl = resolvedCoverPhotoUrl
    if ('location' in b) set.location = b.location ?? null
    if ('placeId' in b) set.placeId = b.placeId ?? null

    if (b.statusName !== undefined) {
      const [status] = await db
        .select({ id: projectStatuses.id })
        .from(projectStatuses)
        .where(
          and(
            eq(projectStatuses.workspaceId, ctx.workspaceId),
            eq(projectStatuses.name, b.statusName),
          ),
        )
      if (!status) {
        return NextResponse.json({ error: 'Status not found' }, { status: 404 })
      }
      set.statusId = status.id
    }

    const [updated] = await db
      .update(projects)
      .set(set)
      .where(and(eq(projects.id, id), eq(projects.workspaceId, ctx.workspaceId)))
      .returning({ id: projects.id })

    if (!updated) {
      return NextResponse.json({ error: 'Project not found' }, { status: 404 })
    }

    // プロジェクトのステータス・日程・概要・名称の変更をプロジェクトチャンネルに system メッセージで通知する。
    // チーム共通の重要情報（決定事項）をチャットに残すための仕組み。失敗しても PATCH 自体は成功させる
    try {
      const datesChanged = 'startDate' in b || 'endDate' in b
      const changes: string[] = []
      if (b.statusName !== undefined) changes.push(`ステータスを「${b.statusName}」に変更しました`)
      if (datesChanged) {
        const [p] = await db
          .select({ startDate: projects.startDate, endDate: projects.endDate })
          .from(projects)
          .where(eq(projects.id, id))
        const s = p?.startDate ?? '未設定'
        const e = p?.endDate ?? '未設定'
        changes.push(`期間を ${s} 〜 ${e} に変更しました`)
      }
      if ('description' in b) changes.push('概要を更新しました')
      if (b.title !== undefined) changes.push(`プロジェクト名を「${b.title}」に変更しました`)

      if (changes.length > 0) {
        const { channels, messages, profiles } = await import('@cairn/db')
        const [channel] = await db
          .select({ id: channels.id })
          .from(channels)
          .where(
            and(
              eq(channels.projectId, id),
              eq(channels.type, 'project'),
              isNull(channels.milestoneId),
            ),
          )
          .limit(1)
        if (channel) {
          const [actor] = await db
            .select({ displayName: profiles.displayName })
            .from(profiles)
            .where(eq(profiles.id, ctx.userId))
          const actorName = actor?.displayName ?? '不明'
          await db.insert(messages).values({
            channelId: channel.id,
            senderId: ctx.userId,
            messageType: 'system',
            content: `${actorName}さんがプロジェクトを更新しました：${changes.join(' / ')}`,
          })
        }
      }
    } catch (e) {
      console.warn('[PATCH /api/projects/[id]] system message insert failed (skipped):', e)
    }

    const resp: { id: string; coverPhotoUrl?: string | null } = { id: updated.id }
    if (resolvedCoverPhotoUrl !== undefined) resp.coverPhotoUrl = resolvedCoverPhotoUrl
    return NextResponse.json(resp)
  } catch (err) {
    console.error('[PATCH /api/projects/[id]]', err)
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 })
  }
}
