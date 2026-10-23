// Copyright 2026 Cairn Contributors
// SPDX-License-Identifier: Apache-2.0

import { NextResponse } from 'next/server'
import { patchProjectSchema } from '@cairn/shared'
import { getAuthContext } from '@/lib/get-auth-context'
import { requireProjectAccess, requireRole } from '@/lib/permissions'

export async function GET(_req: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params
  const { ctx, error: authError } = await getAuthContext({
    allowApiToken: true,
    requiredApiTokenScope: 'read',
  })
  if (authError) return authError

  const forbidden = await requireProjectAccess(ctx.workspaceId, ctx.userId, id, ctx.role)
  if (forbidden) return forbidden

  try {
    const { db, channels, projects, projectStatuses } = await import('@cairn/db')
    const { and, eq, isNull } = await import('drizzle-orm')
    const [project] = await db
      .select({
        id: projects.id,
        title: projects.title,
        description: projects.description,
        statusName: projectStatuses.name,
        statusColor: projectStatuses.color,
        startDate: projects.startDate,
        endDate: projects.endDate,
        archived: projects.archived,
        channelId: channels.id,
        coverPhotoUrl: projects.coverPhotoUrl,
        location: projects.location,
        placeId: projects.placeId,
      })
      .from(projects)
      .leftJoin(projectStatuses, eq(projects.statusId, projectStatuses.id))
      .leftJoin(
        channels,
        and(
          eq(channels.projectId, projects.id),
          eq(channels.type, 'project'),
          isNull(channels.milestoneId),
        ),
      )
      .where(and(eq(projects.id, id), eq(projects.workspaceId, ctx.workspaceId)))
      .limit(1)

    if (!project) return NextResponse.json({ error: 'Project not found' }, { status: 404 })
    return NextResponse.json({
      ...project,
      statusName: project.statusName ?? null,
      statusColor: project.statusColor ?? null,
      channelId: project.channelId ?? null,
    })
  } catch (err) {
    console.error('[GET /api/projects/[id]]', err)
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 })
  }
}

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
      storageDeletionJobs,
      uploadRequests,
    } = await import('@cairn/db')
    const { eq, and, inArray, isNull, ne, or } = await import('drizzle-orm')

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

    const { lockProjectUpdateChannel } = await import('@/lib/chat/post-project-update-message')
    const deleted = await db.transaction(async (tx) => {
      let deletionJobId: string | null = null
      // プロジェクトの更新（PATCH）と同じ「チャンネル → プロジェクト」の順にロックを取る。
      // 削除は CASCADE でこのチャンネルも消すため、プロジェクトを先に取ると、同時に走った更新と
      // 互いのロックを待ち合ってデッドロックする
      await lockProjectUpdateChannel(tx, projectId)
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

      // DB を削除する前に、全バケットを1つの Inngest event として永続キューへ送る。
      // enqueue が失敗すればこのトランザクション全体をロールバックするため、プロジェクトと
      // パス一覧が残り、クライアント再試行でクリーンアップを再送できる。
      const attachmentPaths = filePaths
        .filter((file) => !file.galleryItemId)
        .flatMap((file) => {
          const metadata = (file.metadata ?? {}) as Record<string, unknown>
          const thumbnailPath =
            typeof metadata['thumbnailPath'] === 'string' ? metadata['thumbnailPath'] : null
          return [file.storagePath, thumbnailPath].filter((path): path is string => path !== null)
        })
      const galleryDerivedPaths = [
        ...filePaths
          .filter((file) => file.galleryItemId)
          .flatMap((file) =>
            [file.derivedStoragePath].filter((path): path is string => path !== null),
          ),
        ...pendingUploadPaths.map((request) => request.derivedStoragePath),
      ]
      const galleryOriginalPaths = [
        ...filePaths
          .filter((file) => file.galleryItemId)
          .flatMap((file) => [file.storagePath].filter((path): path is string => path !== null)),
        ...pendingUploadPaths
          .map((request) => request.originalStoragePath)
          .filter((path): path is string => path !== null),
      ]
      let deletionTargets = [
        attachmentPaths.length > 0 ? { bucket: 'chat-attachments', paths: attachmentPaths } : null,
        galleryDerivedPaths.length > 0 ? { bucket: 'gallery', paths: galleryDerivedPaths } : null,
        galleryOriginalPaths.length > 0
          ? { bucket: 'gallery-originals', paths: galleryOriginalPaths }
          : null,
      ].filter((target): target is { bucket: string; paths: string[] } => target !== null)

      // gallery_items とのJOINで同じ files 行が複数現れ得るため、削除対象は file ID ごとに
      // 一度だけ扱う。先に明示削除して、競合した個別削除があった場合は実際に消えた行だけを
      // 使用量へ反映する（プロジェクトCASCADEに任せるとこの差分を確定できない）。
      const uniqueFiles = [...new Map(filePaths.map((file) => [file.id, file])).values()]
      const fileIds = uniqueFiles.map((file) => file.id)
      const sharedFileIds =
        fileIds.length > 0
          ? new Set(
              (
                await tx
                  .selectDistinct({ id: files.id })
                  .from(files)
                  .innerJoin(messageAttachments, eq(messageAttachments.fileId, files.id))
                  .innerJoin(messages, eq(messages.id, messageAttachments.messageId))
                  .innerJoin(channels, eq(channels.id, messages.channelId))
                  .where(
                    and(
                      inArray(files.id, fileIds),
                      or(ne(channels.projectId, projectId), isNull(channels.projectId)),
                    ),
                  )
              ).map((file) => file.id),
            )
          : new Set<string>()
      const removableFileIds = fileIds.filter((id) => !sharedFileIds.has(id))
      // 削除対象プロジェクトを指す共有ファイルは project_id を外してCASCADEから保護する。
      if (sharedFileIds.size > 0) {
        await tx
          .update(files)
          .set({ projectId: null })
          .where(and(inArray(files.id, [...sharedFileIds]), eq(files.projectId, projectId)))
      }
      // 共有ファイルは外部プロジェクトに残すため、outbox の削除対象からも外す。
      deletionTargets = deletionTargets
        .map((target) => ({
          ...target,
          paths: target.paths.filter(
            (path) =>
              !uniqueFiles.some(
                (file) =>
                  sharedFileIds.has(file.id) &&
                  (file.storagePath === path || file.derivedStoragePath === path),
              ),
          ),
        }))
        .filter((target) => target.paths.length > 0)
      if (deletionTargets.length > 0) {
        const [job] = await tx
          .insert(storageDeletionJobs)
          .values({ targets: deletionTargets })
          .returning({ id: storageDeletionJobs.id })
        if (!job) throw new Error('storage deletion outbox insert returned no rows')
        deletionJobId = job.id
      }
      const removedFiles =
        removableFileIds.length > 0
          ? await tx
              .delete(files)
              .where(inArray(files.id, removableFileIds))
              .returning({ fileSize: files.fileSize, derivedFileSize: files.derivedFileSize })
          : []
      const { recordStorageUsageDelta } = await import('@/lib/billing/storage-usage')
      await recordStorageUsageDelta(
        ctx.workspaceId,
        {
          originalBytes: -removedFiles.reduce((total, file) => total + (file.fileSize ?? 0), 0),
          derivedBytes: -removedFiles.reduce(
            (total, file) => total + (file.derivedFileSize ?? 0),
            0,
          ),
        },
        tx,
      )

      const [removedProject] = await tx
        .delete(projects)
        .where(and(eq(projects.id, projectId), eq(projects.workspaceId, ctx.workspaceId)))
        .returning({ id: projects.id })
      if (!removedProject) return null

      return { deletionJobId }
    })

    if (!deleted) return NextResponse.json({ error: 'Project not found' }, { status: 404 })

    if (deleted.deletionJobId) {
      try {
        const { inngest } = await import('@/lib/inngest/client')
        await inngest.send({
          name: 'storage/deletion.requested',
          data: { jobId: deleted.deletionJobId },
        })
      } catch (sendError) {
        // ジョブはコミット済みのため、cron が再送する。削除済みプロジェクトを 500 にしても
        // クライアント再試行では回復できないため、成功として返す。
        console.error('[DELETE /api/projects/[id]] storage deletion enqueue failed:', sendError)
      }
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
    const { eq, and } = await import('drizzle-orm')

    const [project] = await db
      .select({ id: projects.id, startDate: projects.startDate, endDate: projects.endDate })
      .from(projects)
      .where(and(eq(projects.id, id), eq(projects.workspaceId, ctx.workspaceId)))
      .limit(1)

    if (!project) {
      return NextResponse.json({ error: 'Project not found' }, { status: 404 })
    }

    const forbidden = requireRole(ctx.role, 'member')
    if (forbidden) return forbidden

    const { DATE_ORDER_ERROR, isEndBeforeStart } = await import('@/lib/date-range')
    // 下でカバー写真を Storage へ保存する前に、拒否すると分かっている入力を返しておく。
    // 保存した後で 422 / 404 にすると、どのプロジェクトからも参照されない画像が残る。
    // 同時更新まで含めた最終的な判定は、行をロックしたトランザクションの中でもう一度行う。
    // そこで拒否された場合に保存済みの写真を消してはいけない。保存先は Place の写真ごとに決まる
    // 共有のキャッシュ（place-photos/{写真名}.jpg を upsert）で、同じ場所を使う他のプロジェクトが参照し得る
    if (
      ('startDate' in b || 'endDate' in b) &&
      isEndBeforeStart(
        'startDate' in b ? (b.startDate ?? null) : project.startDate,
        'endDate' in b ? (b.endDate ?? null) : project.endDate,
      )
    ) {
      return NextResponse.json({ error: DATE_ORDER_ERROR }, { status: 422 })
    }

    let statusId: string | undefined
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
      statusId = status.id
    }

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

    if (statusId !== undefined) set.statusId = statusId

    const { projectUpdateChange } = await import('@/lib/chat/project-update-message')
    const { lockProjectUpdateChannel, postProjectUpdateMessage } = await import('@/lib/chat/post-project-update-message')

    // 行をロックしてから「保存済みの値と合わせた検証 → 更新 → 通知」までを1つのトランザクションで行う。
    // 分けると、開始日だけ・終了日だけを直す更新が同時に来た時に、互いに古い値で検証を通って
    // 逆転した期間が保存される。通知も確定順と食い違い、古い値の通知が最後に残る
    const outcome = await db.transaction(async (tx) => {
      // ロックは「チャンネル → プロジェクト」の順に取る（チャットの投稿と同じ順。逆にするとデッドロックする）
      await lockProjectUpdateChannel(tx, id)
      const [current] = await tx
        .select({
          title: projects.title,
          description: projects.description,
          statusId: projects.statusId,
          startDate: projects.startDate,
          endDate: projects.endDate,
          location: projects.location,
          archived: projects.archived,
        })
        .from(projects)
        .where(and(eq(projects.id, id), eq(projects.workspaceId, ctx.workspaceId)))
        // キーは変えないので NO KEY UPDATE で足りる。FOR UPDATE だと、このプロジェクトを参照する行の
        // 追加（タスクなどの外部キー検査）まで待たせてしまう
        .for('no key update')
        .limit(1)
      if (!current) return { kind: 'not_found' as const }

      // 片方だけ送られた場合も、保存済みのもう片方と合わせて判定する
      const nextStartDate = 'startDate' in b ? (b.startDate ?? null) : current.startDate
      const nextEndDate = 'endDate' in b ? (b.endDate ?? null) : current.endDate
      const nextLocation = 'location' in b ? (b.location ?? null) : current.location
      if (('startDate' in b || 'endDate' in b) && isEndBeforeStart(nextStartDate, nextEndDate)) {
        return { kind: 'date_order' as const }
      }

      const [row] = await tx
        .update(projects)
        .set(set)
        .where(and(eq(projects.id, id), eq(projects.workspaceId, ctx.workspaceId)))
        .returning({ id: projects.id })
      if (!row) return { kind: 'not_found' as const }

      // チーム共通の決定事項の変更をプロジェクトチャンネルに system メッセージで残す。
      // どの項目も、値が変わらない保存（編集欄を開いて閉じただけ等）では通知しない
      const changes: import('@/lib/chat/project-update-message').ProjectUpdateChange[] = []
      if (b.statusName !== undefined && set.statusId !== current.statusId) {
        changes.push(projectUpdateChange.status(b.statusName))
      }
      if (nextStartDate !== current.startDate || nextEndDate !== current.endDate) {
        changes.push(projectUpdateChange.dates(nextStartDate, nextEndDate))
      }
      if (nextLocation !== current.location) changes.push(projectUpdateChange.location(nextLocation))
      if ('description' in b && (b.description ?? null) !== current.description) {
        changes.push(projectUpdateChange.description())
      }
      if (b.title !== undefined && b.title !== current.title) changes.push(projectUpdateChange.title(b.title))
      if (b.archived !== undefined && b.archived !== current.archived) {
        changes.push(projectUpdateChange.archived(b.archived))
      }
      await postProjectUpdateMessage({ projectId: id, actorId: ctx.userId, changes, tx })

      return { kind: 'ok' as const, id: row.id }
    })

    if (outcome.kind === 'not_found') {
      return NextResponse.json({ error: 'Project not found' }, { status: 404 })
    }
    if (outcome.kind === 'date_order') {
      return NextResponse.json({ error: DATE_ORDER_ERROR }, { status: 422 })
    }
    const updated = { id: outcome.id }

    const resp: { id: string; coverPhotoUrl?: string | null } = { id: updated.id }
    if (resolvedCoverPhotoUrl !== undefined) resp.coverPhotoUrl = resolvedCoverPhotoUrl
    return NextResponse.json(resp)
  } catch (err) {
    console.error('[PATCH /api/projects/[id]]', err)
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 })
  }
}
