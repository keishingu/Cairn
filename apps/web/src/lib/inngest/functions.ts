// Copyright 2026 Cairn Contributors
// SPDX-License-Identifier: Apache-2.0

import { inngest } from './client'
import { FEATURE_FLAGS } from '@cairn/shared'
import { createServiceRoleClient } from '@/lib/supabase/service'
import { isIndexable } from '@/lib/ai/extract-text'
import type { MessageCreatedEvent, TaskAssignedEvent } from './events'
import { sendPushToUser } from '@/lib/push/send'
import { hasReadMessage } from '@/lib/push/suppress'
import { extractMentionIds, stripMentionsToText } from '@/lib/chat/mentions'
import type { PhaseTwoScanResult } from '@/lib/ai-nudges/llm-nudge-delivery'
import type { PhaseTwoNudgeCandidate } from '@/lib/ai-nudges/llm-nudge-scan'
import { passesPhaseTwoConfidence } from '@/lib/ai-nudges/llm-nudge-rules'

// Push 送信前の猶予。閲覧中のユーザーはこの間に自動既読が立つため、
// 「読んでいるのに鳴る」Push を送らずに済む（アプリ内通知・バッジは即時のまま）
const PUSH_GRACE_PERIOD = '10s'

// メンバー一覧から userId → 表示名のリゾルバを作る（通知本文のメンション解決用）
function nameResolver(
  members: { userId: string; displayName: string }[],
): (id: string) => string | undefined {
  const map = new Map(members.map((m) => [m.userId, m.displayName]))
  return (id) => map.get(id)
}

// 猶予期間中に対象メッセージを既読にした受信者を Push 対象から除外する
async function filterUnreadRecipients<T extends { userId: string }>(
  messageId: string,
  channelId: string,
  recipients: T[],
): Promise<T[]> {
  if (recipients.length === 0) return []

  const { db, messages, channelReadStates } = await import('@cairn/db')
  const { eq, and, inArray } = await import('drizzle-orm')

  const [msg] = await db
    .select({ createdAt: messages.createdAt, deletedAt: messages.deletedAt })
    .from(messages)
    .where(eq(messages.id, messageId))
    .limit(1)

  // 猶予中に削除されたメッセージの Push は送らない
  if (!msg || msg.deletedAt) return []

  const states = await db
    .select({
      userId: channelReadStates.userId,
      lastReadAt: channelReadStates.lastReadAt,
      lastReadMessageId: channelReadStates.lastReadMessageId,
    })
    .from(channelReadStates)
    .where(
      and(
        eq(channelReadStates.channelId, channelId),
        inArray(
          channelReadStates.userId,
          recipients.map((r) => r.userId),
        ),
      ),
    )

  const stateMap = new Map(states.map((s) => [s.userId, s]))
  return recipients.filter(
    (r) => !hasReadMessage(stateMap.get(r.userId), { id: messageId, createdAt: msg.createdAt }),
  )
}

export const onMessageCreated = inngest.createFunction(
  { id: 'on-message-created' },
  { event: 'message/created' satisfies MessageCreatedEvent['name'] },
  async ({ event, step }) => {
    const { messageId, channelId, workspaceId, senderId, senderName, content, attachmentFileIds } =
      event.data as MessageCreatedEvent['data']

    // チャンネルメンバー（送信者を除く）を取得。非活性メンバーは DM・ファイル通知の宛先に
    // しないよう active_workspace_members に inner join して active のみに絞る
    // （deactivation は履歴のため channel_members 行を残すため、ここで除外しないと通知が飛ぶ）
    const members = await step.run('fetch-members', async () => {
      const { db, channelMembers, profiles, activeWorkspaceMembers } = await import('@cairn/db')
      const { eq, and } = await import('drizzle-orm')
      return db
        .select({ userId: channelMembers.userId, displayName: profiles.displayName })
        .from(channelMembers)
        .innerJoin(profiles, eq(channelMembers.userId, profiles.id))
        .innerJoin(
          activeWorkspaceMembers,
          and(
            eq(activeWorkspaceMembers.userId, channelMembers.userId),
            eq(activeWorkspaceMembers.workspaceId, workspaceId),
          ),
        )
        .where(eq(channelMembers.channelId, channelId))
        .then((rows) => rows.filter((r) => r.userId !== senderId))
    })

    // DM チャンネルの場合は相手に Push を送って終了
    const isDm = await step.run('check-dm', async () => {
      const { db, channels } = await import('@cairn/db')
      const { eq } = await import('drizzle-orm')
      const [ch] = await db
        .select({ type: channels.type })
        .from(channels)
        .where(eq(channels.id, channelId))
        .limit(1)
      return ch?.type === 'dm'
    })

    const dmBody = stripMentionsToText(content, nameResolver(members))

    if (isDm) {
      // DM はアプリ内通知（ベル）にも記録する。Push を逃しても後から回収できるようにするため
      await step.run('create-dm-notifications', async () => {
        if (members.length === 0) return
        const { db, notifications } = await import('@cairn/db')
        await db.insert(notifications).values(
          members.map((m) => ({
            userId: m.userId,
            workspaceId,
            type: 'dm' as const,
            title: senderName,
            body: dmBody.slice(0, 200),
            data: { messageId, channelId, senderName },
          })),
        )
      })

      if (members.length > 0) {
        // 閲覧中の相手に Push を出さないため、猶予後に既読を再確認してから送る
        await step.sleep('push-grace', PUSH_GRACE_PERIOD)
        const unreadMembers = await step.run('filter-dm-push-targets', () =>
          filterUnreadRecipients(messageId, channelId, members),
        )

        await step.run('send-dm-push', async () => {
          await Promise.allSettled(
            unreadMembers.map((m) =>
              sendPushToUser(m.userId, {
                title: senderName,
                body: dmBody.slice(0, 100),
                url: `/chats/${channelId}`,
              }),
            ),
          )
        })
      }
      return { mentionNotifications: 0, fileNotifications: 0, dm: true }
    }

    // @メンション通知（チャンネル未参加でもワークスペースメンバーなら通知）
    const mentionedIds = extractMentionIds(content)

    if (members.length === 0 && mentionedIds.length === 0)
      return { mentionNotifications: 0, fileNotifications: 0 }
    const mentionedMembers =
      mentionedIds.length > 0
        ? await step.run('fetch-mentioned-members', async () => {
            const { db, activeWorkspaceMembers, profiles } = await import('@cairn/db')
            const { eq, inArray, and, ne } = await import('drizzle-orm')
            // 非活性メンバーにはメンション通知を送らない（active membership のみ宛先にする）
            return db
              .select({ userId: activeWorkspaceMembers.userId, displayName: profiles.displayName })
              .from(activeWorkspaceMembers)
              .innerJoin(profiles, eq(activeWorkspaceMembers.userId, profiles.id))
              .where(
                and(
                  eq(activeWorkspaceMembers.workspaceId, workspaceId),
                  inArray(activeWorkspaceMembers.userId, mentionedIds),
                  ne(activeWorkspaceMembers.userId, senderId),
                ),
              )
          })
        : []

    // 本文プレビューのメンションは送信時点の最新名で解決する（メンバー名 + メンション対象名）
    const mentionBody = stripMentionsToText(
      content,
      nameResolver([...members, ...mentionedMembers]),
    )

    // アクセスできないチャンネルへメンション通知が飛ぶのを防ぐ。
    // - プライベートチャンネル: チャンネルメンバーのみ
    // - プロジェクトチャンネル: 参加外プロジェクトのゲストを除外（メンバー以上は全員可）
    // 通知を飛ばしても遷移先で 403 になり「通知は来るのに開けない」状態になるため、
    // requireChannelAccess と同じスコープ感でここで対象を絞る。
    const notifyMentioned =
      mentionedMembers.length > 0
        ? await step.run('filter-mention-access', async () => {
            const { db, channels, channelMembers, projectMembers, activeWorkspaceMembers } =
              await import('@cairn/db')
            const { eq, and, inArray } = await import('drizzle-orm')
            const { filterMentionRecipients } = await import('@/lib/chat/mention-access')
            const ids = mentionedMembers.map((m) => m.userId)

            const [ch] = await db
              .select({
                type: channels.type,
                projectId: channels.projectId,
                isPrivate: channels.isPrivate,
              })
              .from(channels)
              .where(eq(channels.id, channelId))
              .limit(1)
            if (!ch) return []

            // プライベートチャンネルはメンバーのみ、プロジェクトチャンネルは guest の参加判定に使う集合を引く
            const channelMemberIds = ch.isPrivate
              ? new Set(
                  (
                    await db
                      .select({ userId: channelMembers.userId })
                      .from(channelMembers)
                      .where(
                        and(
                          eq(channelMembers.channelId, channelId),
                          inArray(channelMembers.userId, ids),
                        ),
                      )
                  ).map((r) => r.userId),
                )
              : new Set<string>()

            const guestIds =
              ch.type === 'project' && ch.projectId
                ? new Set(
                    (
                      await db
                        .select({ userId: activeWorkspaceMembers.userId })
                        .from(activeWorkspaceMembers)
                        .where(
                          and(
                            eq(activeWorkspaceMembers.workspaceId, workspaceId),
                            inArray(activeWorkspaceMembers.userId, ids),
                            eq(activeWorkspaceMembers.role, 'guest'),
                          ),
                        )
                    ).map((r) => r.userId),
                  )
                : new Set<string>()

            const projectMemberIds =
              guestIds.size > 0 && ch.projectId
                ? new Set(
                    (
                      await db
                        .select({ userId: projectMembers.userId })
                        .from(projectMembers)
                        .where(
                          and(
                            eq(projectMembers.projectId, ch.projectId),
                            inArray(projectMembers.userId, [...guestIds]),
                          ),
                        )
                    ).map((r) => r.userId),
                  )
                : new Set<string>()

            return filterMentionRecipients({
              channel: ch,
              recipients: mentionedMembers,
              channelMemberIds,
              guestIds,
              projectMemberIds,
            })
          })
        : []

    let mentionNotifications = 0
    if (notifyMentioned.length > 0) {
      await step.run('create-mention-notifications', async () => {
        const { db, notifications, channelReadStates } = await import('@cairn/db')
        const { sql } = await import('drizzle-orm')

        await db.insert(notifications).values(
          notifyMentioned.map((m) => ({
            userId: m.userId,
            workspaceId,
            type: 'mention' as const,
            title: `${senderName} があなたをメンションしました`,
            body: mentionBody.slice(0, 200),
            data: { messageId, channelId, senderName },
          })),
        )

        // unread_mention_count をインクリメント（行が無ければ作成）
        await db
          .insert(channelReadStates)
          .values(
            notifyMentioned.map((m) => ({
              userId: m.userId,
              channelId,
              unreadMentionCount: 1,
            })),
          )
          .onConflictDoUpdate({
            target: [channelReadStates.userId, channelReadStates.channelId],
            set: { unreadMentionCount: sql`${channelReadStates.unreadMentionCount} + 1` },
          })
      })
      mentionNotifications = notifyMentioned.length
    }

    // ファイル添付通知（送信者以外の全メンバーへ）
    let fileNotifications = 0
    if (attachmentFileIds.length > 0) {
      await step.run('create-file-notifications', async () => {
        const { db, notifications, files } = await import('@cairn/db')
        const { eq } = await import('drizzle-orm')

        const [file] = await db
          .select({ fileName: files.fileName })
          .from(files)
          .where(eq(files.id, attachmentFileIds[0]!))
          .limit(1)

        const fileName = file?.fileName ?? 'ファイル'
        const extraCount = attachmentFileIds.length - 1
        const body = extraCount > 0 ? `${fileName} ほか ${extraCount} 件` : fileName

        await db.insert(notifications).values(
          members.map((m) => ({
            userId: m.userId,
            workspaceId,
            type: 'file' as const,
            title: `${senderName} がファイルを共有しました`,
            body,
            data: { messageId, channelId, senderName },
          })),
        )
      })
      fileNotifications = members.length
    }

    // メンション Push は猶予後に既読を再確認してから送る（アプリ内通知・バッジは上で記録済み）
    if (notifyMentioned.length > 0) {
      await step.sleep('push-grace', PUSH_GRACE_PERIOD)
      const unreadMembers = await step.run('filter-mention-push-targets', () =>
        filterUnreadRecipients(messageId, channelId, notifyMentioned),
      )

      await step.run('send-mention-push', async () => {
        await Promise.allSettled(
          unreadMembers.map((m) =>
            sendPushToUser(m.userId, {
              title: `${senderName} があなたをメンションしました`,
              body: mentionBody.slice(0, 100),
              url: `/chats/${channelId}`,
            }),
          ),
        )
      })
    }

    return { mentionNotifications, fileNotifications }
  },
)

export const onTaskAssigned = inngest.createFunction(
  { id: 'on-task-assigned' },
  { event: 'task/assigned' satisfies TaskAssignedEvent['name'] },
  async ({ event, step }) => {
    const { taskTitle, assigneeId, projectTitle, workspaceId, assignerName } =
      event.data as TaskAssignedEvent['data']

    await step.run('create-task-notification', async () => {
      const { db, notifications } = await import('@cairn/db')
      await db.insert(notifications).values({
        userId: assigneeId,
        workspaceId,
        type: 'task' as const,
        title: `${assignerName} があなたにタスクを割り当てました`,
        body: `「${taskTitle}」- ${projectTitle}`,
        data: { assignerName, projectTitle },
      })
    })

    await step.run('send-task-push', async () => {
      await sendPushToUser(assigneeId, {
        title: `${assignerName} があなたにタスクを割り当てました`,
        body: `「${taskTitle}」- ${projectTitle}`,
        url: '/tasks',
      })
    })

    return { notified: assigneeId }
  },
)

const BATCH_SIZE = 100

export const deleteStorageObjects = inngest.createFunction(
  { id: 'delete-storage-objects' },
  { event: 'storage/objects.delete' },
  async ({ event, step }) => {
    const data = event.data as
      | { bucket: string; paths: string[] }
      | { targets: Array<{ bucket: string; paths: string[] }> }
    const targets = 'targets' in data ? data.targets : [{ bucket: data.bucket, paths: data.paths }]

    let deleted = 0
    for (const { bucket, paths } of targets) {
      for (let i = 0; i < paths.length; i += BATCH_SIZE) {
        const batch = paths.slice(i, i + BATCH_SIZE)
        await step.run(`delete-${bucket}-batch-${i}`, async () => {
          const supabase = createServiceRoleClient()
          const { data, error } = await supabase.storage.from(bucket).remove(batch)
          if (error) throw error
          deleted += data?.length ?? 0
        })
      }
    }

    return { deleted }
  },
)

export const runStorageDeletionJob = inngest.createFunction(
  { id: 'run-storage-deletion-job' },
  { event: 'storage/deletion.requested' },
  async ({ event, step }) => {
    const { jobId } = event.data as { jobId: string }
    const { db, storageDeletionJobs } = await import('@cairn/db')
    const { eq } = await import('drizzle-orm')
    const [job] = await db
      .select({ targets: storageDeletionJobs.targets })
      .from(storageDeletionJobs)
      .where(eq(storageDeletionJobs.id, jobId))
      .limit(1)
    if (!job) return { deleted: 0 }

    let deleted = 0
    for (const { bucket, paths } of job.targets) {
      for (let i = 0; i < paths.length; i += BATCH_SIZE) {
        const batch = paths.slice(i, i + BATCH_SIZE)
        await step.run(`delete-${bucket}-batch-${i}`, async () => {
          const supabase = createServiceRoleClient()
          const { data, error } = await supabase.storage.from(bucket).remove(batch)
          if (error) throw error
          deleted += data?.length ?? 0
        })
      }
    }
    await db.delete(storageDeletionJobs).where(eq(storageDeletionJobs.id, jobId))
    return { deleted }
  },
)

export const requeueStorageDeletionJobs = inngest.createFunction(
  { id: 'requeue-storage-deletion-jobs' },
  { cron: 'TZ=Asia/Tokyo */15 * * * *' },
  async () => {
    const { db, storageDeletionJobs } = await import('@cairn/db')
    const rows = await db
      .select({ id: storageDeletionJobs.id })
      .from(storageDeletionJobs)
      .limit(100)
    if (rows.length > 0) {
      await inngest.send(
        rows.map((row) => ({ name: 'storage/deletion.requested', data: { jobId: row.id } })),
      )
    }
    return { enqueued: rows.length }
  },
)

// 既存の画像ファイルにサムネを後付け生成する。1回の実行で BACKFILL_BATCH 件だけ処理し、
// 残りがあれば自身を再送して継続する（長時間実行・タイムアウトを避けるため）。
const BACKFILL_BATCH = 50

export const backfillThumbnails = inngest.createFunction(
  { id: 'backfill-thumbnails' },
  { event: 'attachments/backfill-thumbnails' },
  async ({ event, step }) => {
    const { workspaceId, afterId } = (event.data ?? {}) as {
      workspaceId?: string
      afterId?: string
    }

    const targets = await step.run('fetch-targets', async () => {
      const { db, files, galleryItems } = await import('@cairn/db')
      const { and, asc, eq, gt, isNotNull, notExists, sql } = await import('drizzle-orm')

      return db
        .select({ id: files.id, storagePath: files.storagePath })
        .from(files)
        .where(
          and(
            eq(files.fileType, 'image'),
            isNotNull(files.storagePath),
            // metadata にサムネパスが未設定のものだけを対象にする（再実行で重複処理しない）
            sql`${files.metadata} ->> 'thumbnailPath' IS NULL`,
            // ギャラリー画像は別バケット(gallery)に保存されており createThumbnailFromStorage
            // (chat-attachments 固定) では取得できず永久に失敗し続けるため除外する
            notExists(
              db
                .select({ one: sql`1` })
                .from(galleryItems)
                .where(eq(galleryItems.fileId, files.id)),
            ),
            ...(workspaceId ? [eq(files.workspaceId, workspaceId)] : []),
            // id キーセットで前進する。失敗行は thumbnailPath が NULL のまま残るが、
            // ここで id > afterId に進めることで同じバッチを永久再取得して詰まるのを防ぐ
            ...(afterId ? [gt(files.id, afterId)] : []),
          ),
        )
        .orderBy(asc(files.id))
        .limit(BACKFILL_BATCH)
    })

    if (targets.length === 0) return { processed: 0, done: true }

    const result = await step.run('generate-thumbnails', async () => {
      const { createThumbnailFromStorage } = await import('@/lib/attachments/thumbnail')
      const { db, files } = await import('@cairn/db')
      const { eq, sql } = await import('drizzle-orm')
      const supabase = createServiceRoleClient()

      let generated = 0
      let failed = 0
      for (const t of targets) {
        if (!t.storagePath) continue
        const thumbnailPath = await createThumbnailFromStorage(supabase, t.storagePath)
        if (!thumbnailPath) {
          failed++
          continue
        }
        // 既存 metadata を保持したまま thumbnailPath だけマージする
        await db
          .update(files)
          .set({ metadata: sql`${files.metadata} || ${JSON.stringify({ thumbnailPath })}::jsonb` })
          .where(eq(files.id, t.id))
        generated++
      }
      return { generated, failed }
    })

    // バッチが満杯なら未処理が残っている可能性があるので、最後の id を起点に継続する
    const lastId = targets[targets.length - 1]!.id
    if (targets.length === BACKFILL_BATCH) {
      await step.sendEvent('continue-backfill', {
        name: 'attachments/backfill-thumbnails',
        data: { ...(workspaceId ? { workspaceId } : {}), afterId: lastId },
      })
    }

    return {
      processed: targets.length,
      generated: result.generated,
      failed: result.failed,
      done: targets.length < BACKFILL_BATCH,
    }
  },
)

export const indexFileChunks = inngest.createFunction(
  { id: 'index-file-chunks' },
  { event: 'file/uploaded' },
  async ({ event, step }) => {
    const { fileId, workspaceId, mimeType, storagePath } = event.data as {
      fileId: string
      workspaceId: string
      mimeType: string
      storagePath: string
    }

    if (!isIndexable(mimeType)) {
      return { skipped: true, reason: 'not an indexable document type' }
    }

    const text = await step.run('extract-text', async () => {
      const supabase = createServiceRoleClient()
      const { data, error } = await supabase.storage.from('chat-attachments').download(storagePath)
      if (error || !data) throw new Error(`Storage download failed: ${error?.message}`)

      const { extractText } = await import('@/lib/ai/extract-text')
      const buffer = Buffer.from(await data.arrayBuffer())
      return extractText(buffer, mimeType)
    })

    const chunks = await step.run('chunk-text', async () => {
      const { chunkText } = await import('@/lib/ai/chunk-text')
      return chunkText(text)
    })

    if (chunks.length === 0) return { indexed: 0 }

    await step.run('save-embeddings', async () => {
      const { embedMany } = await import('ai')
      const { openai, EMBEDDING_MODEL } = await import('@/lib/ai/client')
      const { db, documentChunks } = await import('@cairn/db')
      const { eq, and } = await import('drizzle-orm')

      const { embeddings } = await embedMany({
        model: openai.embedding(EMBEDDING_MODEL),
        values: chunks,
      })

      await db
        .delete(documentChunks)
        .where(and(eq(documentChunks.sourceType, 'file'), eq(documentChunks.sourceId, fileId)))

      await db.insert(documentChunks).values(
        chunks.map((content, i) => ({
          workspaceId,
          sourceType: 'file' as const,
          sourceId: fileId,
          chunkIndex: i,
          content,
          embedding: embeddings[i]!,
        })),
      )
    })

    return { indexed: chunks.length }
  },
)

export const indexProjectChunks = inngest.createFunction(
  { id: 'index-project-chunks' },
  { event: 'project/upserted' },
  async ({ event, step }) => {
    const { projectId, workspaceId } = event.data as { projectId: string; workspaceId: string }

    await step.run('embed-and-save', async () => {
      const { db, projects, projectStatuses, projectMembers, profiles, documentChunks } =
        await import('@cairn/db')
      const { eq, and } = await import('drizzle-orm')

      const [row] = await db
        .select({
          title: projects.title,
          description: projects.description,
          startDate: projects.startDate,
          endDate: projects.endDate,
          statusName: projectStatuses.name,
        })
        .from(projects)
        .leftJoin(projectStatuses, eq(projects.statusId, projectStatuses.id))
        .where(and(eq(projects.id, projectId), eq(projects.workspaceId, workspaceId)))
        .limit(1)

      if (!row) return

      const memberRows = await db
        .select({ displayName: profiles.displayName })
        .from(projectMembers)
        .innerJoin(profiles, eq(projectMembers.userId, profiles.id))
        .where(eq(projectMembers.projectId, projectId))

      const lines: string[] = [
        `プロジェクト: ${row.title}`,
        ...(row.description ? [`説明: ${row.description}`] : []),
        ...(row.statusName ? [`ステータス: ${row.statusName}`] : []),
        ...(row.startDate ? [`開始日: ${row.startDate}`] : []),
        ...(row.endDate ? [`終了日: ${row.endDate}`] : []),
        ...(memberRows.length > 0
          ? [`メンバー: ${memberRows.map((m) => m.displayName).join('、')}`]
          : []),
      ]

      const content = lines.join('\n')

      const { embed } = await import('ai')
      const { openai, EMBEDDING_MODEL } = await import('@/lib/ai/client')

      const { embedding } = await embed({
        model: openai.embedding(EMBEDDING_MODEL),
        value: content,
      })

      await db
        .delete(documentChunks)
        .where(
          and(eq(documentChunks.sourceType, 'project'), eq(documentChunks.sourceId, projectId)),
        )

      await db.insert(documentChunks).values({
        workspaceId,
        sourceType: 'project',
        sourceId: projectId,
        chunkIndex: 0,
        content,
        embedding,
      })
    })

    return { indexed: 1 }
  },
)

export const indexExternalLink = inngest.createFunction(
  { id: 'index-external-link' },
  { event: 'link/registered' },
  async ({ event, step }) => {
    const { fileId, workspaceId, docId } = event.data as {
      fileId: string
      workspaceId: string
      docId: string
    }

    const exportUrl = `https://docs.google.com/document/d/${docId}/export?format=txt`

    const fetchResult = await step.run('fetch-text', async () => {
      const res = await fetch(exportUrl, { redirect: 'follow' })
      const contentType = res.headers.get('content-type') ?? ''

      // 非公開ドキュメントはログインページ（text/html）が返る
      if (!res.ok || !contentType.startsWith('text/plain')) {
        return { ok: false as const }
      }

      const rawText = await res.text()

      // 1st try: Content-Disposition ヘッダーからタイトルを取得
      const cd = res.headers.get('content-disposition') ?? ''
      const cdMatch = /filename\*?=(?:UTF-8'')?["']?([^"';\r\n]+)["']?/i.exec(cd)
      let title = cdMatch ? decodeURIComponent(cdMatch[1]!.trim()).replace(/\.txt$/i, '') : null

      // 2nd try: HTML export の <title> タグからタイトルを取得
      if (!title) {
        try {
          const htmlRes = await fetch(
            `https://docs.google.com/document/d/${docId}/export?format=html`,
            { redirect: 'follow' },
          )
          if (htmlRes.ok) {
            const html = await htmlRes.text()
            const htmlMatch = /<title>([^<]+)<\/title>/i.exec(html)
            if (htmlMatch) {
              title = htmlMatch[1]!.trim()
            }
          }
        } catch {
          // タイトル取得失敗は無視（デフォルト名のまま）
        }
      }

      return { ok: true as const, text: rawText, title }
    })

    if (!fetchResult.ok) {
      await step.run('mark-private', async () => {
        const { db, files } = await import('@cairn/db')
        const { eq } = await import('drizzle-orm')
        const [row] = await db
          .select({ metadata: files.metadata })
          .from(files)
          .where(eq(files.id, fileId))
          .limit(1)
        if (!row) return
        const meta = Object.assign({}, row.metadata as Record<string, unknown>)
        await db
          .update(files)
          .set({ metadata: { ...meta, indexingStatus: 'failed' } })
          .where(eq(files.id, fileId))
      })
      return { indexed: 0, reason: 'private' }
    }

    const chunks = await step.run('chunk-text', async () => {
      const { chunkText } = await import('@/lib/ai/chunk-text')
      return chunkText(fetchResult.text)
    })

    await step.run('save-embeddings', async () => {
      const { db, documentChunks, files } = await import('@cairn/db')
      const { eq, and } = await import('drizzle-orm')
      const [row] = await db
        .select({ metadata: files.metadata })
        .from(files)
        .where(eq(files.id, fileId))
        .limit(1)
      if (!row) return

      const meta = Object.assign({}, row.metadata as Record<string, unknown>)
      const newMeta = { ...meta, indexingStatus: 'indexed' }

      if (chunks.length > 0) {
        const { embedMany } = await import('ai')
        const { openai, EMBEDDING_MODEL } = await import('@/lib/ai/client')

        const { embeddings } = await embedMany({
          model: openai.embedding(EMBEDDING_MODEL),
          values: chunks,
        })

        await db
          .delete(documentChunks)
          .where(and(eq(documentChunks.sourceType, 'file'), eq(documentChunks.sourceId, fileId)))

        await db.insert(documentChunks).values(
          chunks.map((content, i) => ({
            workspaceId,
            sourceType: 'file' as const,
            sourceId: fileId,
            chunkIndex: i,
            content,
            embedding: embeddings[i]!,
          })),
        )
      }

      if (fetchResult.title) {
        await db
          .update(files)
          .set({ fileName: fetchResult.title, metadata: newMeta })
          .where(eq(files.id, fileId))
      } else {
        await db.update(files).set({ metadata: newMeta }).where(eq(files.id, fileId))
      }
    })

    return { indexed: chunks.length }
  },
)

export const indexMemberChunks = inngest.createFunction(
  { id: 'index-member-chunks' },
  { event: 'member/upserted' },
  async ({ event, step }) => {
    const { userId, workspaceId } = event.data as { userId: string; workspaceId: string }

    await step.run('embed-and-save', async () => {
      const { db, profiles, memberExperiences, documentChunks, activeWorkspaceMembers } =
        await import('@cairn/db')
      const { eq, and } = await import('drizzle-orm')

      const deleteMemberChunks = () =>
        db
          .delete(documentChunks)
          .where(
            and(
              eq(documentChunks.sourceType, 'member'),
              eq(documentChunks.sourceId, userId),
              eq(documentChunks.workspaceId, workspaceId),
            ),
          )

      const [activeMembership] = await db
        .select({ userId: activeWorkspaceMembers.userId })
        .from(activeWorkspaceMembers)
        .where(
          and(
            eq(activeWorkspaceMembers.workspaceId, workspaceId),
            eq(activeWorkspaceMembers.userId, userId),
          ),
        )
        .limit(1)

      if (!activeMembership) {
        await deleteMemberChunks()
        return
      }

      const [profile] = await db
        .select({ displayName: profiles.displayName, bio: profiles.bio })
        .from(profiles)
        .where(eq(profiles.id, userId))
        .limit(1)

      if (!profile) return

      const experiences = await db
        .select({
          category: memberExperiences.category,
          title: memberExperiences.title,
          level: memberExperiences.level,
          notes: memberExperiences.notes,
        })
        .from(memberExperiences)
        .where(eq(memberExperiences.userId, userId))

      const lines: string[] = [
        `メンバー: ${profile.displayName}`,
        ...(profile.bio ? [`自己紹介: ${profile.bio}`] : []),
        ...(experiences.length > 0
          ? [
              '\nスキル・経験:',
              ...experiences.map(
                (e) =>
                  `- ${e.category} (${e.title})${e.level ? `: ${e.level}` : ''}${e.notes ? `\n  ${e.notes}` : ''}`,
              ),
            ]
          : []),
      ]

      const content = lines.join('\n')

      const { embed } = await import('ai')
      const { openai, EMBEDDING_MODEL } = await import('@/lib/ai/client')

      const { embedding } = await embed({
        model: openai.embedding(EMBEDDING_MODEL),
        value: content,
      })

      await deleteMemberChunks()

      await db.insert(documentChunks).values({
        workspaceId,
        sourceType: 'member',
        sourceId: userId,
        chunkIndex: 0,
        content,
        embedding,
      })
    })

    return { indexed: 1 }
  },
)

// Phase 1 の AI PMO ハートビート。JST 09:00 に構造化タスクだけを再評価し、
// LLM・メッセージ巡回・埋め込みは一切行わない。
export const reconcileAiNudgesHeartbeat = inngest.createFunction(
  { id: 'reconcile-ai-nudges-heartbeat-phase1' },
  { cron: 'TZ=Asia/Tokyo 0 9 * * *' },
  async ({ step }) => {
    if (!FEATURE_FLAGS.aiPmo) return { skipped: true }
    return step.run('reconcile-task-nudges', async () => {
      const { reconcilePhaseOneAiNudges } = await import('@/lib/ai-nudges/reconcile')
      return reconcilePhaseOneAiNudges()
    })
  },
)

// Phase 2 の差分巡回。6時間ごとにDM以外の新着チャンネルだけを二段階LLMで評価する。
// 02:00 JST の実行は候補を生成した後、08:00までdurable sleepしてからコード側の
// 発話ゲートを再評価する。concurrency=1 + 同一関数内FIFOにより、古い遅延runを先に配信する。
export const scanAiNudgesPhaseTwo = inngest.createFunction(
  { id: 'scan-ai-nudges-phase2', concurrency: { limit: 1 } },
  { cron: 'TZ=Asia/Tokyo 0 2,8,14,20 * * *' },
  async ({ step }) => {
    if (!FEATURE_FLAGS.aiPmo) return { skipped: true }
    const channels = await step.run('list-channels-with-new-messages', async () => {
      const { listPhaseTwoChannelsToScan } = await import('@/lib/ai-nudges/llm-nudge-scan')
      return listPhaseTwoChannelsToScan()
    })

    const results: PhaseTwoScanResult[] = []
    const remainingCandidateBudget = new Map<string, number>()
    for (const channel of channels) {
      const deltaInput = await step.run(`load-channel-delta-${channel.channelId}`, async () => {
        const { loadPhaseTwoChannelInput } = await import('@/lib/ai-nudges/llm-nudge-scan')
        return loadPhaseTwoChannelInput(channel, 'delta')
      })
      const recheckInput = await step.run(`load-channel-recheck-${channel.channelId}`, async () => {
        const { loadPhaseTwoChannelInput } = await import('@/lib/ai-nudges/llm-nudge-scan')
        return loadPhaseTwoChannelInput(channel, 'unanswered_ask_recheck')
      })
      for (const input of [deltaInput, recheckInput]) {
        if (!input) continue

        let budget = remainingCandidateBudget.get(input.workspaceId)
        if (budget === undefined) {
          budget = await step.run(`load-phase2-budget-${input.workspaceId}`, async () => {
            const { getPhaseTwoScanCandidateBudget } = await import('@/lib/ai-nudges/llm-nudge-scan')
            return getPhaseTwoScanCandidateBudget(input.workspaceId)
          })
          remainingCandidateBudget.set(input.workspaceId, budget)
        }
        // 配信可能な候補枠が残っていないワークスペースはLLMを呼ばず、カーソルも進めない。
        if (budget <= 0) continue

        const scanKind = input.isUnansweredAskRecheck ? 'recheck' : 'delta'
        const primaryCandidates = await step.run(
          `screen-channel-${channel.channelId}-${scanKind}`,
          async () => {
            const { screenPhaseTwoCandidates } = await import('@/lib/ai-nudges/llm-nudge-scan')
            return screenPhaseTwoCandidates(input)
          },
        )
        const primaryCandidateFilter = await step.run(
          `exclude-delivered-candidates-${channel.channelId}-${scanKind}`,
          async () => {
            const { excludeIneligiblePhaseTwoPrimaryCandidates } = await import(
              '@/lib/ai-nudges/llm-nudge-scan'
            )
            const { excludeDeliveredPhaseTwoPrimaryCandidates } = await import(
              '@/lib/ai-nudges/llm-nudge-scan'
            )
            const eligibleCandidates = await excludeIneligiblePhaseTwoPrimaryCandidates(
              input,
              primaryCandidates,
            )
            return excludeDeliveredPhaseTwoPrimaryCandidates(input, eligibleCandidates)
          },
        )
        const refinedCandidates: PhaseTwoNudgeCandidate[] = []
        let attemptedPrimaryCandidates = 0
        // false positiveを飛ばしつつ、残りの配信枠が埋まった時点で精査を止める。
        // 未試行候補が残る場合だけカーソルを保持して次回へ回す。
        for (const [index, candidate] of primaryCandidateFilter.candidates.entries()) {
          if (refinedCandidates.length >= budget) break
          attemptedPrimaryCandidates += 1
          const refined = await step.run(
            `refine-channel-${channel.channelId}-${scanKind}-${index}`,
            async () => {
              const { refinePhaseTwoCandidate } = await import('@/lib/ai-nudges/llm-nudge-scan')
              return refinePhaseTwoCandidate(input, candidate)
            },
          )
          // 配信時と同じ信頼度ゲートをここでも適用し、低信頼候補で枠を使い切らない。
          if (refined && passesPhaseTwoConfidence(refined.confidence)) refinedCandidates.push(refined)
        }
        const acceptedCandidates = refinedCandidates
        remainingCandidateBudget.set(input.workspaceId, budget - acceptedCandidates.length)
        const hasDeferredCandidates =
          attemptedPrimaryCandidates < primaryCandidateFilter.candidates.length
        // 残高枠で未試行候補が残った入力は、買い増し後に同じ差分を再評価する。
        results.push({
          input:
            hasDeferredCandidates
              ? { ...input, advancesCursor: false }
              : input,
          candidates: acceptedCandidates,
          preservedActiveRiskTargets: primaryCandidateFilter.preservedActiveRiskTargets,
        })
      }
    }
    // 配信stepの再試行が22時以降へずれた場合も、DB書き込み直前の判定で翌08時まで待つ。
    for (let attempt = 0; ; attempt += 1) {
      const delivery = await step.run(`apply-phase2-speech-gate-${attempt}`, async () => {
        const { deliverPhaseTwoScanResults } = await import('@/lib/ai-nudges/llm-nudge-delivery')
        return deliverPhaseTwoScanResults(results)
      })
      if (!('deferredUntil' in delivery)) return delivery
      await step.sleepUntil(`wait-for-quiet-hours-to-end-${attempt}`, delivery.deferredUntil)
    }
  },
)

// files の通常削除はカウンタを増減させるが、プロジェクト削除の CASCADE はDB内で完結する。
// そのため日次で files を正として再集計し、乖離を検出・修正する。
export const reconcileWorkspaceStorageUsageDaily = inngest.createFunction(
  { id: 'reconcile-workspace-storage-usage', concurrency: { limit: 1 } },
  { cron: 'TZ=Asia/Tokyo 15 3 * * *' },
  async ({ step }) => {
    const results = await step.run('reconcile-storage-usage', async () => {
      const { reconcileAllWorkspaceStorageUsage } = await import('@/lib/billing/storage-usage')
      return reconcileAllWorkspaceStorageUsage()
    })

    const drifted = results.filter(
      (result) => result.originalBytesDrift !== 0 || result.derivedBytesDrift !== 0,
    )
    if (drifted.length > 0) {
      console.warn('[billing] Storage usage drift reconciled:', {
        workspaces: drifted.length,
        drifted,
      })
    }

    return { reconciled: results.length, drifted: drifted.length }
  },
)

// JST の日次家賃。使用量 reconciliation の直後に同じカウンタを入力として記帳する。
export const chargeStorageRentDaily = inngest.createFunction(
  { id: 'charge-storage-rent', concurrency: { limit: 1 } },
  { cron: 'TZ=Asia/Tokyo 20 3 * * *' },
  async ({ step }) => {
    return step.run('charge-storage-rent', async () => {
      const { isBillingEnabled } = await import('@/lib/billing/is-billing-enabled')
      if (!isBillingEnabled()) {
        const { advanceAllWorkspaceStorageRentCursors } = await import('@/lib/billing/storage-rent')
        return { skipped: true, advanced: await advanceAllWorkspaceStorageRentCursors() }
      }

      const { chargeAllWorkspaceStorageRent } = await import('@/lib/billing/storage-rent')
      const results = await chargeAllWorkspaceStorageRent()
      return { skipped: false, charged: results.length, advanced: 0 }
    })
  },
)

// 署名付きURLだけが発行されて確定されなかった画像を定期回収する。
export const cleanupExpiredUploadRequests = inngest.createFunction(
  { id: 'cleanup-expired-upload-requests', concurrency: { limit: 1 } },
  { cron: 'TZ=Asia/Tokyo 15 * * * *' },
  async ({ step }) => {
    return step.run('remove-expired-upload-objects', async () => {
      const { cleanupExpiredUploadRequests: cleanup } = await import('@/lib/uploads/cleanup')
      return cleanup()
    })
  },
)
