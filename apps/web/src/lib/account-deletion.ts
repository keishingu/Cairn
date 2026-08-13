// Copyright 2026 Cairn Contributors
// SPDX-License-Identifier: Apache-2.0

import {
  aiConversations,
  aiNudges,
  apiTokens,
  auditLogs,
  billingCustomers,
  channelMembers,
  channelReadStates,
  connectedAccounts,
  db,
  documentChunks,
  files,
  galleryComments,
  galleryItems,
  galleryLikes,
  googleCalendarEvents,
  mcpOAuthConnections,
  memberExperiences,
  messageBookmarks,
  messageReactions,
  messages,
  notifications,
  pinnedProjects,
  profiles,
  projectMembers,
  projects,
  pushSubscriptions,
  savedFileFilters,
  storageDeletionJobs,
  uploadRequests,
  workspaceMembers,
  workspaceInvites,
} from '@cairn/db'
import { and, eq, isNull, sql } from 'drizzle-orm'
import { isBillingEnabled } from '@/lib/billing/is-billing-enabled'
import { recordStorageUsageDelta } from '@/lib/billing/storage-usage'
import { getStripeClient } from '@/lib/billing/stripe'
import { GALLERY_BUCKET, GALLERY_ORIGINALS_BUCKET } from '@/lib/gallery-upload'
import { ATTACHMENTS_BUCKET } from '@/lib/attachments/thumbnail'
import { inngest } from '@/lib/inngest/client'
import { createServiceRoleClient } from '@/lib/supabase/service'
import { lockAccountLifecycle } from '@/lib/access/account-lifecycle-lock'

export const DELETED_USER_DISPLAY_NAME = '退会済みユーザー'

export interface BlockingOwnerWorkspace {
  id: string
  name: string
}

interface PendingUpload {
  derivedStoragePath: string
  originalStoragePath: string | null
  storageBucket: string
}

interface StoredFile {
  storagePath: string | null
  derivedStoragePath: string | null
  thumbnailPath: string | null
  isGallery: boolean
}

interface StorageDeletionTarget {
  bucket: string
  paths: string[]
}

export class LastOwnerAccountDeletionError extends Error {
  constructor(readonly workspaces: BlockingOwnerWorkspace[]) {
    super('最後のオーナーであるワークスペースがあります')
    this.name = 'LastOwnerAccountDeletionError'
  }
}

export interface AccountDeletionDependencies {
  findBlockingOwnerWorkspaces(userId: string): Promise<BlockingOwnerWorkspace[]>
  deleteBillingCustomer(customerId: string | null): Promise<void>
  anonymizeAndRevoke(
    userId: string,
    now: Date,
    deleteBillingCustomer: (customerId: string | null) => Promise<void>,
  ): Promise<AccountDeletionResult>
  enqueueStorageDeletion(jobId: string | null): Promise<void>
  enqueueProjectReindex(projects: AffectedProject[]): Promise<void>
  deleteAuthUser(userId: string): Promise<void>
}

export interface AffectedProject {
  projectId: string
  workspaceId: string
}

export interface AccountDeletionResult {
  storageDeletionJobId: string | null
  affectedProjects: AffectedProject[]
}

type SqlClient = Pick<typeof db, 'execute'>

async function findBlockingOwnerWorkspaces(
  client: SqlClient,
  userId: string,
): Promise<BlockingOwnerWorkspace[]> {
  const result = await client.execute<{ id: string; name: string }>(sql`
    select w.id, w.name
    from workspace_members target
    join workspaces w on w.id = target.workspace_id
    where target.user_id = ${userId}
      and target.role = 'owner'
      and target.membership_status = 'active'
      and not exists (
        select 1
        from active_workspace_members other_owner
        where other_owner.workspace_id = target.workspace_id
          and other_owner.role = 'owner'
          and other_owner.user_id <> ${userId}
      )
    order by w.name, w.id
  `)

  return result.rows
}

export function buildStorageDeletionTargets(
  avatarPaths: string[],
  storedFiles: StoredFile[],
  pendingUploads: PendingUpload[],
): StorageDeletionTarget[] {
  const pathsByBucket = new Map<string, Set<string>>()
  const add = (bucket: string, path: string | null) => {
    if (!path) return
    const paths = pathsByBucket.get(bucket) ?? new Set<string>()
    paths.add(path)
    pathsByBucket.set(bucket, paths)
  }

  for (const path of avatarPaths) add('avatars', path)
  for (const file of storedFiles) {
    if (file.isGallery) {
      add(GALLERY_ORIGINALS_BUCKET, file.storagePath)
      add(GALLERY_BUCKET, file.derivedStoragePath)
    } else {
      add(ATTACHMENTS_BUCKET, file.storagePath)
      add(ATTACHMENTS_BUCKET, file.thumbnailPath)
    }
  }
  for (const upload of pendingUploads) {
    add(upload.storageBucket, upload.derivedStoragePath)
    add(GALLERY_ORIGINALS_BUCKET, upload.originalStoragePath)
  }

  return [...pathsByBucket].map(([bucket, paths]) => ({ bucket, paths: [...paths] }))
}

async function deleteBillingCustomer(customerId: string | null): Promise<void> {
  if (!customerId) return
  if (!isBillingEnabled()) {
    throw new Error('Billing customer exists but billing integration is disabled')
  }

  try {
    const deleted = await getStripeClient().customers.del(customerId)
    if (!deleted.deleted) throw new Error('Stripe customer was not deleted')
  } catch (error) {
    // Stripe側だけ先に削除でき、後続処理の再試行になった場合は成功扱いにする。
    if ((error as { code?: string }).code === 'resource_missing') return
    throw error
  }
}

async function anonymizeAndRevoke(
  userId: string,
  now: Date,
  deleteCustomer: (customerId: string | null) => Promise<void>,
): Promise<AccountDeletionResult> {
  return db.transaction(async (tx) => {
    // profileがまだ無い初回セットアップともadvisory lockで直列化し、必ずtombstoneを残す。
    // 非キー列だけのupsertは外部キー検査のKEY SHAREと競合しない。
    await lockAccountLifecycle(tx, userId)
    await tx.execute(sql`
      insert into profiles (id, display_name, account_deletion_started_at)
      values (${userId}, ${DELETED_USER_DISPLAY_NAME}, ${now})
      on conflict (id) do update
      set account_deletion_started_at = coalesce(
        profiles.account_deletion_started_at,
        excluded.account_deletion_started_at
      )
    `)

    // 対象membershipと同じworkspaceのactive ownerを決定順でロックし、
    // owner移譲とアカウント削除の競合でowner不在になることを防ぐ。
    await tx.execute(sql`
      select 1
      from workspace_members
      where workspace_id in (
        select workspace_id from workspace_members where user_id = ${userId}
      )
        and (
          user_id = ${userId}
          or (role = 'owner' and membership_status = 'active')
        )
      order by workspace_id, user_id
      for update
    `)

    const blocked = await findBlockingOwnerWorkspaces(tx, userId)
    if (blocked.length > 0) throw new LastOwnerAccountDeletionError(blocked)

    const [billingCustomer] = await tx
      .select({ stripeCustomerId: billingCustomers.stripeCustomerId })
      .from(billingCustomers)
      .where(eq(billingCustomers.userId, userId))
      .limit(1)

    // 排他membershipロック取得後に列挙する。先行中のavatar更新は完了まで待ち、
    // 後続の更新は退会commit後にactive再確認で拒否されるため、一覧が陳腐化しない。
    const memberships = await tx
      .select({ workspaceId: workspaceMembers.workspaceId })
      .from(workspaceMembers)
      .where(eq(workspaceMembers.userId, userId))
    const avatarPaths: string[] = []
    const admin = createServiceRoleClient()
    for (const workspaceId of new Set(memberships.map((membership) => membership.workspaceId))) {
      for (let offset = 0; ; offset += 100) {
        const { data, error } = await admin.storage.from('avatars').list(workspaceId, {
          search: userId,
          limit: 100,
          offset,
        })
        if (error) throw error
        for (const item of data) {
          if (item.name.startsWith(`${userId}.`)) avatarPaths.push(`${workspaceId}/${item.name}`)
        }
        if (data.length < 100) break
      }
    }

    // Appleのアカウント削除要件に合わせ、本人が投稿したメッセージ本文・写真・
    // ファイル・コメント・AI会話を削除する。プロジェクトやタスクなど共同作業の
    // 構造は残し、作成者参照は匿名化したprofilesへ向けたままにする。
    await tx.delete(notifications).where(sql`
      ${notifications.data}->>'messageId' in (
        select id::text from messages where sender_id = ${userId}
      )
    `)
    await tx.delete(notifications).where(sql`
        ${notifications.data}->>'assignerId' = ${userId}
      `)
    await tx.delete(aiNudges).where(sql`
      ${aiNudges.messageId} in (select id from messages where sender_id = ${userId})
    `)
    const affectedProjects = await tx
      .select({ projectId: projects.id, workspaceId: projects.workspaceId })
      .from(projects)
      .where(sql`
        ${projects.id} in (select project_id from project_members where user_id = ${userId})
      `)
      .orderBy(projects.id)
      .for('update')
    await tx.delete(documentChunks).where(sql`
      ${documentChunks.sourceType} = 'project'
      and ${documentChunks.sourceId} in (
        select project_id from project_members where user_id = ${userId}
      )
    `)
    await tx.delete(documentChunks).where(sql`
      ${documentChunks.sourceType} = 'file'
      and ${documentChunks.sourceId} in (
        select f.id from files f
        where f.uploaded_by = ${userId}
          or exists (
            select 1 from gallery_items gi
            where gi.file_id = f.id and gi.uploaded_by = ${userId}
          )
      )
    `)
    const galleryFileIds = new Set(
      (
        await tx
          .select({ id: galleryItems.fileId })
          .from(galleryItems)
          .innerJoin(files, eq(files.id, galleryItems.fileId))
          .where(sql`${files.uploadedBy} = ${userId} or ${galleryItems.uploadedBy} = ${userId}`)
      ).map((file) => file.id),
    )
    const removedFiles = await tx
      .delete(files)
      .where(
        sql`
        ${files.uploadedBy} = ${userId}
        or exists (
          select 1 from gallery_items gi
          where gi.file_id = ${files.id} and gi.uploaded_by = ${userId}
        )
      `,
      )
      .returning({
        id: files.id,
        workspaceId: files.workspaceId,
        storagePath: files.storagePath,
        derivedStoragePath: files.derivedStoragePath,
        metadata: files.metadata,
        fileSize: files.fileSize,
        derivedFileSize: files.derivedFileSize,
      })
    const removedBytesByWorkspace = new Map<
      string,
      { originalBytes: number; derivedBytes: number }
    >()
    for (const file of removedFiles) {
      const removed = removedBytesByWorkspace.get(file.workspaceId) ?? {
        originalBytes: 0,
        derivedBytes: 0,
      }
      removed.originalBytes += file.fileSize ?? 0
      removed.derivedBytes += file.derivedFileSize ?? 0
      removedBytesByWorkspace.set(file.workspaceId, removed)
    }
    for (const workspaceId of [...removedBytesByWorkspace.keys()].sort()) {
      const removed = removedBytesByWorkspace.get(workspaceId)!
      await recordStorageUsageDelta(
        workspaceId,
        {
          originalBytes: -removed.originalBytes,
          derivedBytes: -removed.derivedBytes,
        },
        tx,
      )
    }
    await tx
      .update(messages)
      .set({ content: '', deletedAt: now, updatedAt: now })
      .where(eq(messages.senderId, userId))
    await tx.delete(aiConversations).where(eq(aiConversations.createdBy, userId))
    await tx.delete(workspaceInvites).where(eq(workspaceInvites.createdBy, userId))

    // 本人だけに属する設定・接続情報を削除する。
    await tx.delete(apiTokens).where(eq(apiTokens.userId, userId))
    await tx.delete(mcpOAuthConnections).where(eq(mcpOAuthConnections.userId, userId))
    await tx.delete(connectedAccounts).where(eq(connectedAccounts.userId, userId))
    await tx.delete(googleCalendarEvents).where(eq(googleCalendarEvents.userId, userId))
    await tx.delete(pushSubscriptions).where(eq(pushSubscriptions.userId, userId))
    await tx.delete(notifications).where(eq(notifications.userId, userId))
    await tx.delete(channelReadStates).where(eq(channelReadStates.userId, userId))
    await tx.delete(messageBookmarks).where(eq(messageBookmarks.userId, userId))
    await tx.delete(messageReactions).where(eq(messageReactions.userId, userId))
    await tx.delete(galleryLikes).where(eq(galleryLikes.userId, userId))
    await tx.delete(galleryComments).where(eq(galleryComments.userId, userId))
    await tx.delete(memberExperiences).where(eq(memberExperiences.userId, userId))
    await tx.delete(pinnedProjects).where(eq(pinnedProjects.userId, userId))
    await tx.delete(savedFileFilters).where(eq(savedFileFilters.userId, userId))
    await tx.delete(aiNudges).where(eq(aiNudges.userId, userId))
    await tx.delete(projectMembers).where(eq(projectMembers.userId, userId))
    await tx.delete(channelMembers).where(eq(channelMembers.userId, userId))
    // signed URLはAuth削除後も有効期限までは使用できるため、intent行は残して
    // 期限切れcleanupでも再削除する。ここでは現在存在する対象をoutboxへ含める。
    const pendingUploads = await tx
      .select({
        derivedStoragePath: uploadRequests.derivedStoragePath,
        originalStoragePath: uploadRequests.originalStoragePath,
        storageBucket: sql<string>`coalesce(to_jsonb(${uploadRequests})->>'storage_bucket', 'gallery')`,
      })
      .from(uploadRequests)
      .where(and(eq(uploadRequests.requestedBy, userId), isNull(uploadRequests.finalizedAt)))
    await tx
      .update(uploadRequests)
      .set({ fileName: '', derivedMimeType: '', originalMimeType: null })
      .where(and(eq(uploadRequests.requestedBy, userId), isNull(uploadRequests.finalizedAt)))
    await tx
      .delete(documentChunks)
      .where(and(eq(documentChunks.sourceType, 'member'), eq(documentChunks.sourceId, userId)))

    await tx
      .update(auditLogs)
      .set({ userId: null, payload: {} })
      .where(eq(auditLogs.userId, userId))

    // アカウント削除は再活性化できる「卒業生化」と異なるため、所属自体を削除する。
    // 既存コンテンツの表示名はprofilesの匿名名へフォールバックする。
    await tx.delete(workspaceMembers).where(eq(workspaceMembers.userId, userId))

    await tx
      .update(profiles)
      .set({
        displayName: DELETED_USER_DISPLAY_NAME,
        bio: null,
        icalToken: null,
        aiNudgesEnabled: false,
        theme: 'system',
        accentId: 'emerald',
        updatedAt: now,
      })
      .where(eq(profiles.id, userId))

    const storageTargets = buildStorageDeletionTargets(
      avatarPaths,
      removedFiles.map((file) => ({
        storagePath: file.storagePath,
        derivedStoragePath: file.derivedStoragePath,
        thumbnailPath:
          typeof (file.metadata as Record<string, unknown> | null)?.['thumbnailPath'] === 'string'
            ? ((file.metadata as Record<string, unknown>)['thumbnailPath'] as string)
            : null,
        isGallery: galleryFileIds.has(file.id),
      })),
      pendingUploads,
    )
    let storageDeletionJobId: string | null = null
    if (storageTargets.length > 0) {
      const [job] = await tx
        .insert(storageDeletionJobs)
        .values({ targets: storageTargets })
        .returning({ id: storageDeletionJobs.id })
      if (!job) throw new Error('storage deletion outbox insert returned no rows')
      storageDeletionJobId = job.id
    }

    // owner集合をロックしたトランザクション内で課金停止まで完了させる。
    // これによりowner競合でDB処理だけロールバックしたのに課金だけ止まる状態を避ける。
    // Stripe成功後にDB commitが失敗しても、再試行時のresource_missingは成功扱いになる。
    await deleteCustomer(billingCustomer?.stripeCustomerId ?? null)
    await tx.delete(billingCustomers).where(eq(billingCustomers.userId, userId))

    return { storageDeletionJobId, affectedProjects }
  })
}

async function enqueueStorageDeletion(jobId: string | null): Promise<void> {
  if (!jobId) return
  try {
    await inngest.send({ name: 'storage/deletion.requested', data: { jobId } })
  } catch (error) {
    // outboxはDBに残るためcronが再送する。アカウント削除を失敗扱いにはしない。
    console.error('[account-deletion] storage deletion enqueue failed:', error)
  }
}

async function enqueueProjectReindex(projects: AffectedProject[]): Promise<void> {
  if (projects.length === 0) return
  try {
    await inngest.send(
      projects.map(({ projectId, workspaceId }) => ({
        name: 'project/upserted' as const,
        data: { projectId, workspaceId },
      })),
    )
  } catch (error) {
    // 索引は管理画面から再構築できるため、Auth削除を失敗扱いにはしない。
    console.error('[account-deletion] project reindex enqueue failed:', error)
  }
}

async function deleteAuthUser(userId: string): Promise<void> {
  const { error } = await createServiceRoleClient().auth.admin.deleteUser(userId)
  if (error) throw error
}

const defaultDependencies: AccountDeletionDependencies = {
  findBlockingOwnerWorkspaces: (userId) => findBlockingOwnerWorkspaces(db, userId),
  deleteBillingCustomer,
  anonymizeAndRevoke,
  enqueueStorageDeletion,
  enqueueProjectReindex,
  deleteAuthUser,
}

export async function deleteAccount(
  userId: string,
  dependencies: AccountDeletionDependencies = defaultDependencies,
): Promise<void> {
  const blocked = await dependencies.findBlockingOwnerWorkspaces(userId)
  if (blocked.length > 0) throw new LastOwnerAccountDeletionError(blocked)

  const { storageDeletionJobId, affectedProjects } = await dependencies.anonymizeAndRevoke(
    userId,
    new Date(),
    dependencies.deleteBillingCustomer,
  )
  await dependencies.enqueueStorageDeletion(storageDeletionJobId)
  await dependencies.enqueueProjectReindex(affectedProjects)
  await dependencies.deleteAuthUser(userId)
}
