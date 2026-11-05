// Copyright 2026 Cairn Contributors
// SPDX-License-Identifier: Apache-2.0

import { importedMessageId } from './ids'
import type { CompleteImportJobInput, CreateImportJobInput, ImportBatchInput, ImportMessageInput } from './schema'

/**
 * 外部チャットの取り込みを Cairn の DB に書き込む（docs/import-design.md）。
 *
 * - 通常の投稿 API（postMessage）は使わない。Inngest の `message/created` を出さないので、
 *   メンション・プッシュ・メールの通知、AI の巡回・埋め込みのジョブは動かない
 * - メッセージ ID は取り込み元のキーから決める（UUID v5）。同じデータを何度流しても二重登録されない
 * - 書き込みはバッチ（最大200件）ごとに1トランザクション。途中で止まっても、済んだバッチは残り、
 *   再実行すると済んだメッセージは重複としてスキップされる
 * - 権限の確認（owner / admin、チャンネルの所属）は呼び出し側の Route Handler とここの両方で行う
 */

export class ImportServiceError extends Error {
  constructor(readonly status: number, message: string) {
    super(message)
    this.name = 'ImportServiceError'
  }
}

type Db = Awaited<typeof import('@cairn/db')>['db']

async function loadDb() {
  const mod = await import('@cairn/db')
  const orm = await import('drizzle-orm')
  return { ...mod, orm }
}

/** ワークスペースの公開チャンネル（type = 'workspace'）で、管理者が閲覧できるものだけを取り込み先にする */
async function assertImportTargetChannels(db: Db, workspaceId: string, userId: string, channelIds: string[]) {
  const { channels, channelMembers, orm } = await loadDb()
  const { and, eq, inArray } = orm
  const rows = await db
    .select({ id: channels.id, type: channels.type, isPrivate: channels.isPrivate, archivedAt: channels.archivedAt })
    .from(channels)
    .where(and(eq(channels.workspaceId, workspaceId), inArray(channels.id, channelIds)))
  const byId = new Map(rows.map(row => [row.id, row]))
  const privateIds = rows.filter(row => row.isPrivate).map(row => row.id)
  const joined = privateIds.length > 0
    ? new Set((await db
        .select({ channelId: channelMembers.channelId })
        .from(channelMembers)
        .where(and(eq(channelMembers.userId, userId), inArray(channelMembers.channelId, privateIds)))).map(row => row.channelId))
    : new Set<string>()
  for (const channelId of channelIds) {
    const row = byId.get(channelId)
    if (!row || row.type !== 'workspace') throw new ImportServiceError(400, '取り込み先はこのワークスペースのチャンネルを指定してください')
    if (row.archivedAt) throw new ImportServiceError(400, 'アーカイブ済みのチャンネルには取り込めません')
    if (row.isPrivate && !joined.has(channelId)) throw new ImportServiceError(403, '参加していない非公開チャンネルには取り込めません')
  }
}

export async function createImportJob(workspaceId: string, userId: string, input: CreateImportJobInput) {
  const { db, importJobs, importJobConversations, importIdentities, activeWorkspaceMembers, orm } = await loadDb()
  const { and, eq, inArray, sql } = orm

  const conversationIds = input.conversations.map(c => c.externalId)
  if (new Set(conversationIds).size !== conversationIds.length) throw new ImportServiceError(400, '同じ会話が重複しています')
  await assertImportTargetChannels(db, workspaceId, userId, [...new Set(input.conversations.map(c => c.channelId))])

  const identityKeys = new Set(input.identities.map(i => i.key))
  for (const link of input.links) {
    if (!identityKeys.has(link.key)) throw new ImportServiceError(400, '紐づけ先の投稿者が見つかりません')
    if (input.identities.find(i => i.key === link.key)?.anonymous) throw new ImportServiceError(400, '投稿者不明は Cairn のユーザーに紐づけられません')
  }
  const linkUserIds = [...new Set(input.links.map(link => link.userId))]
  if (linkUserIds.length > 0) {
    const members = await db
      .select({ userId: activeWorkspaceMembers.userId })
      .from(activeWorkspaceMembers)
      .where(and(eq(activeWorkspaceMembers.workspaceId, workspaceId), inArray(activeWorkspaceMembers.userId, linkUserIds)))
    if (members.length !== linkUserIds.length) throw new ImportServiceError(400, '紐づけ先はこのワークスペースのメンバーにしてください')
  }

  return db.transaction(async (tx) => {
    const [job] = await tx.insert(importJobs).values({
      workspaceId,
      source: input.source,
      createdBy: userId,
      exportedAt: input.exportedAt ? new Date(input.exportedAt) : null,
      stats: { conversations: input.conversations.length, totalMessages: input.conversations.reduce((n, c) => n + c.totalMessages, 0) },
    }).returning({ id: importJobs.id })
    if (!job) throw new Error('import job insert returned no rows')

    await tx.insert(importJobConversations).values(input.conversations.map(c => ({
      jobId: job.id,
      externalConversationId: c.externalId,
      channelId: c.channelId,
      totalMessages: c.totalMessages,
    })))

    if (input.identities.length > 0) {
      await tx.insert(importIdentities).values(input.identities.map(identity => ({
        workspaceId,
        source: input.source,
        externalKey: identity.key,
        displayName: identity.displayName,
        isAnonymous: identity.anonymous,
        kind: identity.kind,
      }))).onConflictDoUpdate({
        target: [importIdentities.workspaceId, importIdentities.source, importIdentities.externalKey],
        // 名前は分かった方を残す（後のエクスポートで名前が判明した場合）
        set: { displayName: sql`coalesce(excluded.display_name, ${importIdentities.displayName})` },
      })
    }

    // 管理者が確認した紐づけ。既に別の人へ紐づいているものは上書きしない（変更は投稿者の一覧から行う）
    for (const link of input.links) {
      await tx.update(importIdentities)
        .set({ linkedUserId: link.userId, linkedBy: userId, linkedAt: new Date() })
        .where(and(
          eq(importIdentities.workspaceId, workspaceId),
          eq(importIdentities.source, input.source),
          eq(importIdentities.externalKey, link.key),
          eq(importIdentities.isAnonymous, false),
          sql`${importIdentities.linkedUserId} is null`,
        ))
    }
    return { jobId: job.id }
  })
}

async function loadRunningJob(db: Db, workspaceId: string, jobId: string) {
  const { importJobs, orm } = await loadDb()
  const { and, eq } = orm
  const [job] = await db
    .select({ id: importJobs.id, source: importJobs.source, status: importJobs.status })
    .from(importJobs)
    .where(and(eq(importJobs.id, jobId), eq(importJobs.workspaceId, workspaceId)))
    .limit(1)
  if (!job) throw new ImportServiceError(404, '取り込みジョブが見つかりません')
  if (job.status !== 'running') throw new ImportServiceError(409, 'この取り込みジョブは終了しています')
  return job
}

export interface ImportBatchResult {
  imported: number
  duplicates: number
  quotesLinked: number
  quotesUnresolved: number
  attachments: number
  missingMedia: number
  reactions: number
}

export async function importMessageBatch(
  workspaceId: string,
  userId: string,
  jobId: string,
  input: ImportBatchInput,
): Promise<ImportBatchResult> {
  const {
    db, channels, messages, messageAttachments, importIdentities, importedMessages,
    importedMessageReactions, importedFiles, importJobConversations, importJobs, IMPORT_SENDER_PROFILE_ID, orm,
  } = await loadDb()
  const { and, eq, inArray, sql } = orm

  const job = await loadRunningJob(db, workspaceId, jobId)
  const [conversation] = await db
    .select({ id: importJobConversations.id, channelId: importJobConversations.channelId })
    .from(importJobConversations)
    .where(and(eq(importJobConversations.jobId, jobId), eq(importJobConversations.externalConversationId, input.conversationExternalId)))
    .limit(1)
  if (!conversation?.channelId) throw new ImportServiceError(404, 'この会話はジョブの取り込み対象ではありません')
  const channelId = conversation.channelId
  // ジョブ作成後にチャンネルの権限が変わっていないか、バッチごとに確かめる
  await assertImportTargetChannels(db, workspaceId, userId, [channelId])

  const externalIds = input.messages.map(m => m.externalId)
  if (new Set(externalIds).size !== externalIds.length) throw new ImportServiceError(400, '同じメッセージが重複しています')

  const identityKeys = [...new Set(input.messages.flatMap(m => [m.identityKey, ...m.reactions.map(r => r.identityKey)]))]
  const identityRows = await db
    .select({ id: importIdentities.id, key: importIdentities.externalKey })
    .from(importIdentities)
    .where(and(eq(importIdentities.workspaceId, workspaceId), eq(importIdentities.source, job.source), inArray(importIdentities.externalKey, identityKeys)))
  const identityIdByKey = new Map(identityRows.map(row => [row.key, row.id]))
  const missingIdentity = identityKeys.find(key => !identityIdByKey.has(key))
  if (missingIdentity !== undefined) throw new ImportServiceError(400, 'ジョブに登録されていない投稿者が含まれています')

  const objectIds = [...new Set(input.messages.flatMap(m => m.mediaObjectIds))]
  const fileRows = objectIds.length > 0
    ? await db
        .select({ objectId: importedFiles.externalObjectId, fileId: importedFiles.fileId })
        .from(importedFiles)
        .where(and(eq(importedFiles.workspaceId, workspaceId), eq(importedFiles.source, job.source), inArray(importedFiles.externalObjectId, objectIds)))
    : []
  const fileIdByObject = new Map(fileRows.map(row => [row.objectId, row.fileId]))

  const idFor = (externalId: string) => importedMessageId(workspaceId, job.source, input.conversationExternalId, externalId)

  return db.transaction(async (tx) => {
    // 同じチャンネルへの並行した取り込みと投稿の順序を直列化する（通常の投稿と同じロック）
    await tx.select({ id: channels.id }).from(channels).where(eq(channels.id, channelId)).for('update')

    const already = await tx
      .select({ externalMessageId: importedMessages.externalMessageId })
      .from(importedMessages)
      .where(and(
        eq(importedMessages.workspaceId, workspaceId),
        eq(importedMessages.source, job.source),
        eq(importedMessages.externalConversationId, input.conversationExternalId),
        inArray(importedMessages.externalMessageId, externalIds),
      ))
    const alreadySet = new Set(already.map(row => row.externalMessageId))
    const fresh = input.messages.filter(m => !alreadySet.has(m.externalId))

    // 引用元: 同じチャンネルに取り込み済みか、このバッチで先に入るものだけ。推定はしない
    const quotedIds = [...new Set(fresh.map(m => m.quotedExternalId).filter((id): id is string => !!id))]
    const quotedUuids = quotedIds.map(idFor)
    const existingQuoted = quotedUuids.length > 0
      ? new Set((await tx
          .select({ id: messages.id })
          .from(messages)
          .where(and(inArray(messages.id, quotedUuids), eq(messages.channelId, channelId)))).map(row => row.id))
      : new Set<string>()
    const freshIds = new Set(fresh.map(m => m.externalId))

    const result: ImportBatchResult = { imported: 0, duplicates: input.messages.length - fresh.length, quotesLinked: 0, quotesUnresolved: 0, attachments: 0, missingMedia: 0, reactions: 0 }
    if (fresh.length === 0) {
      await bumpCounts(tx, conversation.id, result)
      return result
    }

    const parentFor = (message: ImportMessageInput): string | null => {
      if (!message.quotedExternalId) return null
      const target = idFor(message.quotedExternalId)
      if (existingQuoted.has(target) || freshIds.has(message.quotedExternalId)) {
        result.quotesLinked++
        return target
      }
      result.quotesUnresolved++
      return null
    }

    // 引用元が同じバッチ内にある場合に外部キーが先に満たされるよう、投稿日時の順に入れる
    const ordered = [...fresh].sort((a, b) => a.sentAt.localeCompare(b.sentAt) || a.externalId.localeCompare(b.externalId))
    const inserted = await tx.insert(messages).values(ordered.map(message => ({
      id: idFor(message.externalId),
      channelId,
      senderId: IMPORT_SENDER_PROFILE_ID,
      messageType: 'text' as const,
      content: message.text,
      parentMessageId: parentFor(message),
      createdAt: new Date(message.sentAt),
      updatedAt: new Date(message.editedAt && message.editedAt > message.sentAt ? message.editedAt : message.sentAt),
    }))).onConflictDoNothing({ target: messages.id }).returning({ id: messages.id })
    const insertedIds = new Set(inserted.map(row => row.id))
    const insertedMessages = ordered.filter(message => insertedIds.has(idFor(message.externalId)))
    // ID は決まっているので、別の会話・別のチャンネルに既に同じ ID があれば重複として数える
    result.duplicates += ordered.length - insertedMessages.length
    result.imported = insertedMessages.length
    if (insertedMessages.length === 0) {
      await bumpCounts(tx, conversation.id, result)
      return result
    }

    await tx.insert(importedMessages).values(insertedMessages.map(message => ({
      messageId: idFor(message.externalId),
      workspaceId,
      source: job.source,
      externalConversationId: input.conversationExternalId,
      externalMessageId: message.externalId,
      identityId: identityIdByKey.get(message.identityKey)!,
      jobId,
      originalSentAt: new Date(message.sentAt),
      originalEditedAt: message.editedAt ? new Date(message.editedAt) : null,
      attributes: message.attributes,
    })))

    const reactionRows = insertedMessages.flatMap(message => message.reactions.map(reaction => ({
      messageId: idFor(message.externalId),
      identityId: identityIdByKey.get(reaction.identityKey)!,
      emoji: reaction.emoji,
      sourceKey: reaction.sourceKey,
      reactedAt: new Date(reaction.reactedAt),
    })))
    if (reactionRows.length > 0) {
      const insertedReactions = await tx.insert(importedMessageReactions).values(reactionRows).onConflictDoNothing().returning({ id: importedMessageReactions.id })
      result.reactions = insertedReactions.length
    }

    const attachmentRows = insertedMessages.flatMap(message => message.mediaObjectIds.flatMap((objectId, index) => {
      const fileId = fileIdByObject.get(objectId)
      if (!fileId) {
        result.missingMedia++
        return []
      }
      return [{ messageId: idFor(message.externalId), fileId, displayOrder: index }]
    }))
    if (attachmentRows.length > 0) {
      await tx.insert(messageAttachments).values(attachmentRows)
      result.attachments = attachmentRows.length
    }

    await bumpCounts(tx, conversation.id, result)
    await tx.update(importJobs).set({ updatedAt: new Date() }).where(eq(importJobs.id, jobId))
    return result
  })

  async function bumpCounts(tx: Parameters<Parameters<Db['transaction']>[0]>[0], jobConversationId: string, result: ImportBatchResult) {
    await tx.update(importJobConversations).set({
      status: 'running',
      importedMessages: sql`${importJobConversations.importedMessages} + ${result.imported}`,
      duplicateMessages: sql`${importJobConversations.duplicateMessages} + ${result.duplicates}`,
      updatedAt: new Date(),
    }).where(eq(importJobConversations.id, jobConversationId))
  }
}

export async function lookupImportedMedia(workspaceId: string, jobId: string, objectIds: string[]) {
  const { db, importedFiles, files, orm } = await loadDb()
  const { and, eq, inArray } = orm
  const job = await loadRunningJob(db, workspaceId, jobId)
  const rows = await db
    .select({ objectId: importedFiles.externalObjectId, fileId: importedFiles.fileId })
    .from(importedFiles)
    .innerJoin(files, eq(files.id, importedFiles.fileId))
    .where(and(eq(importedFiles.workspaceId, workspaceId), eq(importedFiles.source, job.source), inArray(importedFiles.externalObjectId, objectIds)))
  return Object.fromEntries(rows.map(row => [row.objectId, row.fileId]))
}

/**
 * 通常のアップロード経路（署名付き URL → finalize）で登録したファイルを、取り込み元のメディア ID に対応づける。
 * 先に登録済みのものがあれば、そちらを返す（後からアップロードしたファイルは添付されないまま残る）。
 */
export async function registerImportedMedia(
  workspaceId: string,
  userId: string,
  jobId: string,
  input: { objectId: string; fileId: string; channelId: string },
) {
  const { db, importedFiles, importJobConversations, files, orm } = await loadDb()
  const { and, eq } = orm
  const job = await loadRunningJob(db, workspaceId, jobId)

  const [target] = await db
    .select({ channelId: importJobConversations.channelId })
    .from(importJobConversations)
    .where(and(eq(importJobConversations.jobId, jobId), eq(importJobConversations.channelId, input.channelId)))
    .limit(1)
  if (!target) throw new ImportServiceError(400, 'このジョブの取り込み先ではないチャンネルです')

  const [file] = await db
    .select({ id: files.id, workspaceId: files.workspaceId, uploadedBy: files.uploadedBy, storagePath: files.storagePath })
    .from(files)
    .where(eq(files.id, input.fileId))
    .limit(1)
  // 自分がこのワークスペースのこのチャンネルにアップロードしたファイルだけを対応づける
  if (!file || file.workspaceId !== workspaceId || file.uploadedBy !== userId || !file.storagePath?.startsWith(`${workspaceId}/${input.channelId}/${userId}/`)) {
    throw new ImportServiceError(400, '対応づけられないファイルです')
  }

  const inserted = await db.insert(importedFiles).values({
    workspaceId,
    source: job.source,
    externalObjectId: input.objectId,
    fileId: input.fileId,
    channelId: input.channelId,
    jobId,
  }).onConflictDoNothing().returning({ fileId: importedFiles.fileId })
  if (inserted[0]) return { fileId: inserted[0].fileId, reused: false }
  const [existing] = await db
    .select({ fileId: importedFiles.fileId })
    .from(importedFiles)
    .where(and(eq(importedFiles.workspaceId, workspaceId), eq(importedFiles.source, job.source), eq(importedFiles.externalObjectId, input.objectId)))
    .limit(1)
  if (!existing) throw new Error('imported file lookup failed after conflict')
  return { fileId: existing.fileId, reused: true }
}

/**
 * ジョブを終える。取り込み先のチャンネルは、過去ログが未読として一気に積まれないよう既読位置を置き、
 * AI の巡回が過去ログを新着として読まないよう巡回位置を最新に合わせる。
 */
export async function completeImportJob(workspaceId: string, jobId: string, input: CompleteImportJobInput) {
  const { db, importJobs, importJobConversations, channels, channelMembers, channelReadStates, aiScanStates, messages, activeWorkspaceMembers, orm } = await loadDb()
  const { and, eq, desc, inArray, ne, sql } = orm
  await loadRunningJob(db, workspaceId, jobId)

  const conversations = await db
    .select({ id: importJobConversations.id, channelId: importJobConversations.channelId, total: importJobConversations.totalMessages, imported: importJobConversations.importedMessages, duplicates: importJobConversations.duplicateMessages })
    .from(importJobConversations)
    .where(eq(importJobConversations.jobId, jobId))
  const channelIds = [...new Set(conversations.map(c => c.channelId).filter((id): id is string => !!id))]

  await db.transaction(async (tx) => {
    for (const conversation of conversations) {
      const done = conversation.imported + conversation.duplicates >= conversation.total
      await tx.update(importJobConversations)
        // 全件が取り込み済み（重複を含む）でなければ、途中で止まった会話として残す。再実行で続きから入る
        .set({ status: done ? 'completed' : 'failed', updatedAt: new Date() })
        .where(eq(importJobConversations.id, conversation.id))
    }

    if (channelIds.length > 0) {
      const channelRows = await tx
        .select({ id: channels.id, isPrivate: channels.isPrivate })
        .from(channels)
        .where(and(eq(channels.workspaceId, workspaceId), inArray(channels.id, channelIds)))
      for (const channel of channelRows) {
        const readers = channel.isPrivate
          ? await tx.select({ userId: channelMembers.userId }).from(channelMembers).where(eq(channelMembers.channelId, channel.id))
          : await tx.select({ userId: activeWorkspaceMembers.userId }).from(activeWorkspaceMembers)
              .where(and(eq(activeWorkspaceMembers.workspaceId, workspaceId), ne(activeWorkspaceMembers.role, 'guest')))
        if (readers.length > 0) {
          // 既読位置がまだ無い人だけ。既にある人は取り込んだ過去ログ（作成日時が古い）より後を読んでいる
          await tx.insert(channelReadStates)
            .values(readers.map(reader => ({ userId: reader.userId, channelId: channel.id, lastReadAt: new Date() })))
            .onConflictDoNothing()
        }
        const [latest] = await tx
          .select({ id: messages.id })
          .from(messages)
          .where(eq(messages.channelId, channel.id))
          .orderBy(desc(messages.createdAt))
          .limit(1)
        if (latest) {
          await tx.insert(aiScanStates)
            .values({ channelId: channel.id, lastScannedMessageId: latest.id, lastScannedAt: new Date() })
            .onConflictDoNothing()
        }
      }
    }

    const totals = conversations.reduce((acc, c) => ({ imported: acc.imported + c.imported, duplicates: acc.duplicates + c.duplicates }), { imported: 0, duplicates: 0 })
    await tx.update(importJobs).set({
      status: input.status,
      report: input.report,
      error: input.error,
      stats: sql`${importJobs.stats} || ${JSON.stringify(totals)}::jsonb`,
      updatedAt: new Date(),
      finishedAt: new Date(),
    }).where(and(eq(importJobs.id, jobId), eq(importJobs.workspaceId, workspaceId)))
  })
  return getImportJob(workspaceId, jobId)
}

export async function getImportJob(workspaceId: string, jobId: string) {
  const { db, importJobs, importJobConversations, orm } = await loadDb()
  const { and, eq } = orm
  const [job] = await db.select().from(importJobs).where(and(eq(importJobs.id, jobId), eq(importJobs.workspaceId, workspaceId))).limit(1)
  if (!job) throw new ImportServiceError(404, '取り込みジョブが見つかりません')
  const conversations = await db
    .select({
      externalConversationId: importJobConversations.externalConversationId,
      channelId: importJobConversations.channelId,
      status: importJobConversations.status,
      totalMessages: importJobConversations.totalMessages,
      importedMessages: importJobConversations.importedMessages,
      duplicateMessages: importJobConversations.duplicateMessages,
    })
    .from(importJobConversations)
    .where(eq(importJobConversations.jobId, jobId))
  return {
    id: job.id,
    source: job.source,
    status: job.status,
    exportedAt: job.exportedAt?.toISOString() ?? null,
    stats: job.stats,
    report: job.report,
    error: job.error,
    createdAt: job.createdAt.toISOString(),
    finishedAt: job.finishedAt?.toISOString() ?? null,
    conversations,
  }
}

export async function listImportJobs(workspaceId: string) {
  const { db, importJobs, orm } = await loadDb()
  const { desc, eq } = orm
  const rows = await db
    .select({ id: importJobs.id, source: importJobs.source, status: importJobs.status, stats: importJobs.stats, createdAt: importJobs.createdAt, finishedAt: importJobs.finishedAt })
    .from(importJobs)
    .where(eq(importJobs.workspaceId, workspaceId))
    .orderBy(desc(importJobs.createdAt))
    .limit(20)
  return rows.map(row => ({ ...row, createdAt: row.createdAt.toISOString(), finishedAt: row.finishedAt?.toISOString() ?? null }))
}

export async function listImportIdentities(workspaceId: string, source: string) {
  const { db, importIdentities, importedMessages, workspaceMembers, profiles, orm } = await loadDb()
  const { and, eq, sql } = orm
  const rows = await db
    .select({
      id: importIdentities.id,
      key: importIdentities.externalKey,
      displayName: importIdentities.displayName,
      isAnonymous: importIdentities.isAnonymous,
      kind: importIdentities.kind,
      linkedUserId: importIdentities.linkedUserId,
      linkedUserName: sql<string | null>`coalesce(${workspaceMembers.displayName}, ${profiles.displayName})`,
      messageCount: sql<number>`(select count(*)::int from ${importedMessages} where ${importedMessages.identityId} = ${importIdentities.id})`,
    })
    .from(importIdentities)
    .leftJoin(profiles, eq(profiles.id, importIdentities.linkedUserId))
    .leftJoin(workspaceMembers, and(eq(workspaceMembers.userId, importIdentities.linkedUserId), eq(workspaceMembers.workspaceId, workspaceId)))
    .where(and(eq(importIdentities.workspaceId, workspaceId), eq(importIdentities.source, source)))
  return rows
}

/** 管理者が確認した紐づけを付け替える・外す。投稿者不明は紐づけられない */
export async function linkImportIdentity(workspaceId: string, adminId: string, identityId: string, userId: string | null) {
  const { db, importIdentities, activeWorkspaceMembers, orm } = await loadDb()
  const { and, eq } = orm
  const [identity] = await db
    .select({ id: importIdentities.id, isAnonymous: importIdentities.isAnonymous })
    .from(importIdentities)
    .where(and(eq(importIdentities.id, identityId), eq(importIdentities.workspaceId, workspaceId)))
    .limit(1)
  if (!identity) throw new ImportServiceError(404, '投稿者が見つかりません')
  if (identity.isAnonymous && userId) throw new ImportServiceError(400, '投稿者不明は Cairn のユーザーに紐づけられません')
  if (userId) {
    const [member] = await db
      .select({ userId: activeWorkspaceMembers.userId })
      .from(activeWorkspaceMembers)
      .where(and(eq(activeWorkspaceMembers.workspaceId, workspaceId), eq(activeWorkspaceMembers.userId, userId)))
      .limit(1)
    if (!member) throw new ImportServiceError(400, '紐づけ先はこのワークスペースのメンバーにしてください')
  }
  await db.update(importIdentities)
    .set(userId ? { linkedUserId: userId, linkedBy: adminId, linkedAt: new Date() } : { linkedUserId: null, linkedBy: null, linkedAt: null })
    .where(eq(importIdentities.id, identityId))
}

/**
 * 過去のジョブで取り込み先にした会話とチャンネルの対応。再実行（中断後の再開）では同じチャンネルを選ばせる。
 * メッセージの重複判定はワークスペース単位なので、別のチャンネルを選ぶと取り込み済みの分はそちらに入らない。
 */
export async function listImportedConversations(workspaceId: string, source: string) {
  const { db, importJobs, importJobConversations, channels, orm } = await loadDb()
  const { and, desc, eq } = orm
  const rows = await db
    .select({
      externalConversationId: importJobConversations.externalConversationId,
      channelId: importJobConversations.channelId,
      channelName: channels.name,
      status: importJobConversations.status,
      importedMessages: importJobConversations.importedMessages,
      createdAt: importJobs.createdAt,
    })
    .from(importJobConversations)
    .innerJoin(importJobs, eq(importJobs.id, importJobConversations.jobId))
    .leftJoin(channels, eq(channels.id, importJobConversations.channelId))
    .where(and(eq(importJobs.workspaceId, workspaceId), eq(importJobs.source, source)))
    .orderBy(desc(importJobs.createdAt))
  const latest = new Map<string, { externalConversationId: string; channelId: string | null; channelName: string | null; status: string }>()
  for (const row of rows) {
    if (!latest.has(row.externalConversationId) && row.channelId) {
      latest.set(row.externalConversationId, { externalConversationId: row.externalConversationId, channelId: row.channelId, channelName: row.channelName, status: row.status })
    }
  }
  return [...latest.values()]
}
