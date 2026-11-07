// Copyright 2026 Cairn Contributors
// SPDX-License-Identifier: Apache-2.0

import { importedMessageId, uuidV5 } from './ids'
import { MAX_BATCH_MESSAGES, type CompleteImportJobInput, type CreateImportJobInput, type ImportBatchInput, type PublishBatchInput, type ResolveUnknownInput } from './schema'

/**
 * 外部チャットの取り込みを Cairn の DB に書き込む（docs/import-design.md）。
 *
 * - 取り込みは2段階。stageMessageBatch で一時保管し（チャンネルには出ない）、publishConversationBatch で
 *   発言者を確定したうえで messages に移す。送信者は紐づけた本人か投稿者ごとの取り込み用プロフィールで、表示時の差し替えは無い
 * - 通常の投稿 API（postMessage）は使わない。Inngest の `message/created` を出さないので、
 *   メンション・プッシュ・メールの通知、AI の巡回・埋め込みのジョブは動かない
 * - 一時保管とメッセージの ID は取り込み元のキーから決める。同じデータを何度流しても二重登録されない
 * - 書き込みはバッチ（最大200件）ごとに1トランザクション。途中で止まっても、済んだバッチは残り、再実行で続きから入る
 * - 権限の確認（運営者・owner / admin、チャンネルの所属）は呼び出し側の Route Handler とここの両方で行う
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
      unknownPolicy: c.unknownPolicy,
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
      await syncImportProfileNames(tx, workspaceId, input.source, input.identities.map(identity => identity.key))
    }

    // 管理者が確認した紐づけ。既に別の人へ紐づいているものは上書きしない（変更は投稿者の一覧から行う）。
    // 前のジョブで公開済みの投稿があれば、紐づけの画面と同じく送信者とリアクションを本人に付け替える（再実行で発言者が分かれないように）
    const linkTargets = await loadIdentities(tx, workspaceId, input.source, input.links.map(link => link.key), { lock: true })
    for (const link of input.links) {
      const identity = linkTargets.get(link.key)
      if (!identity || identity.isAnonymous || identity.linkedUserId) continue
      await applyIdentitySender(tx, identity, link.userId)
      await tx.update(importIdentities)
        .set({ linkedUserId: link.userId, linkedBy: userId, linkedAt: new Date() })
        .where(eq(importIdentities.id, identity.id))
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

type Tx = Parameters<Parameters<Db['transaction']>[0]>[0]

/** 名前が分からない投稿者の取り込み用プロフィールの表示名（データとして持つ。docs/import-design.md §3） */
const IMPORT_PROFILE_FALLBACK_NAMES: Record<string, string> = {
  anonymous: '投稿者不明',
  exporter: 'エクスポートした人',
  'unnamed-participant': '名前不明の参加者',
  named: '不明',
}

interface IdentityRow {
  id: string
  workspaceId: string
  source: string
  externalKey: string
  displayName: string | null
  isAnonymous: boolean
  kind: string
  profileId: string | null
  linkedUserId: string | null
}

/**
 * 投稿者の取り込み用プロフィール（profiles.kind = 'import'）を用意する。ID は投稿者から決めるので、並行して呼ばれても1つになる。
 * auth.users を持たず、どのワークスペースのメンバーにもならない（アプリの Bot と同じ扱い）
 */
async function ensureIdentityProfile(tx: Tx, identity: IdentityRow): Promise<string> {
  if (identity.profileId) return identity.profileId
  const { profiles, importIdentities, orm } = await loadDb()
  const { eq } = orm
  const profileId = uuidV5(`import-profile\n${identity.id}`)
  await tx.insert(profiles).values({
    id: profileId,
    displayName: (identity.displayName ?? IMPORT_PROFILE_FALLBACK_NAMES[identity.kind] ?? IMPORT_PROFILE_FALLBACK_NAMES['named']!).slice(0, 200),
    kind: 'import',
  }).onConflictDoNothing()
  await tx.update(importIdentities).set({ profileId }).where(eq(importIdentities.id, identity.id))
  identity.profileId = profileId
  return profileId
}

/**
 * 後のエクスポートで名前が分かった投稿者の、作成済みの取り込み用プロフィールの表示名を揃える。
 * 公開済みの過去ログはプロフィールの表示名で出るので、投稿者の行だけ直すと名前不明のまま残る
 */
async function syncImportProfileNames(tx: Tx, workspaceId: string, source: string, keys: string[]) {
  if (keys.length === 0) return
  const { orm } = await loadDb()
  const { sql } = orm
  await tx.execute(sql`
    update profiles p set display_name = left(i.display_name, 200)
    from import_identities i
    where i.profile_id = p.id and p.kind = 'import'
      and i.workspace_id = ${workspaceId} and i.source = ${source}
      and i.external_key in (${sql.join(keys.map(key => sql`${key}`), sql`, `)})
      and i.display_name is not null
      and p.display_name is distinct from left(i.display_name, 200)
  `)
}

/** 公開したメッセージ・リアクションの送信者。紐づけた Cairn ユーザー本人か、投稿者ごとの取り込み用プロフィール */
async function senderFor(tx: Tx, identity: IdentityRow): Promise<string> {
  return identity.linkedUserId ?? ensureIdentityProfile(tx, identity)
}

/**
 * 送信者を決めて書き込む前に読むとき（紐づけの変更・公開）は lock = true にし、同じ投稿者への処理をコミットまで直列にする
 * （公開中に紐づけが変わって古い送信者で入る・古い送信者から付け替える、を防ぐ）。
 * 公開は取り込み用プロフィールを作るときに投稿者の行を更新するので共有ロックでは足りない。行は id 順にロックしてデッドロックを避ける
 */
async function loadIdentities(db: Db | Tx, workspaceId: string, source: string, keys: string[], options?: { lock?: boolean }): Promise<Map<string, IdentityRow>> {
  const { importIdentities, orm } = await loadDb()
  const { and, eq, inArray } = orm
  if (keys.length === 0) return new Map()
  const query = db
    .select({
      id: importIdentities.id,
      workspaceId: importIdentities.workspaceId,
      source: importIdentities.source,
      externalKey: importIdentities.externalKey,
      displayName: importIdentities.displayName,
      isAnonymous: importIdentities.isAnonymous,
      kind: importIdentities.kind,
      profileId: importIdentities.profileId,
      linkedUserId: importIdentities.linkedUserId,
    })
    .from(importIdentities)
    .where(and(eq(importIdentities.workspaceId, workspaceId), eq(importIdentities.source, source), inArray(importIdentities.externalKey, keys)))
  const rows = options?.lock ? await query.orderBy(importIdentities.id).for('update') : await query
  return new Map(rows.map(row => [row.externalKey, row]))
}

async function loadJobConversation(db: Db, jobId: string, conversationExternalId: string) {
  const { importJobConversations, orm } = await loadDb()
  const { and, eq } = orm
  const [conversation] = await db
    .select({ id: importJobConversations.id, channelId: importJobConversations.channelId, unknownPolicy: importJobConversations.unknownPolicy })
    .from(importJobConversations)
    .where(and(eq(importJobConversations.jobId, jobId), eq(importJobConversations.externalConversationId, conversationExternalId)))
    .limit(1)
  if (!conversation?.channelId) throw new ImportServiceError(404, 'この会話はジョブの取り込み対象ではありません')
  return { ...conversation, channelId: conversation.channelId }
}

export interface StageBatchResult {
  staged: number
  duplicates: number
}

/**
 * 解析したメッセージを一時保管する（チャンネルにはまだ出ない）。同じメッセージは二重に保管しない。
 * 発言者の確定と公開は publishConversationBatch で行う
 */
export async function stageMessageBatch(
  workspaceId: string,
  userId: string,
  jobId: string,
  input: ImportBatchInput,
): Promise<StageBatchResult> {
  const { db, importStagedMessages, importJobConversations, orm } = await loadDb()
  const { and, eq, inArray, isNull, ne, sql } = orm
  const job = await loadRunningJob(db, workspaceId, jobId)
  const conversation = await loadJobConversation(db, jobId, input.conversationExternalId)
  await assertImportTargetChannels(db, workspaceId, userId, [conversation.channelId])

  const externalIds = input.messages.map(m => m.externalId)
  if (new Set(externalIds).size !== externalIds.length) throw new ImportServiceError(400, '同じメッセージが重複しています')

  const identityKeys = [...new Set(input.messages.flatMap(m => [m.identityKey, ...m.reactions.map(r => r.identityKey)]))]
  const identities = await loadIdentities(db, workspaceId, job.source, identityKeys)
  if (identityKeys.some(key => !identities.has(key))) throw new ImportServiceError(400, 'ジョブに登録されていない投稿者が含まれています')

  return db.transaction(async (tx) => {
    const inserted = await tx.insert(importStagedMessages).values(input.messages.map(message => ({
      workspaceId,
      source: job.source,
      externalConversationId: input.conversationExternalId,
      externalMessageId: message.externalId,
      identityId: identities.get(message.identityKey)!.id,
      jobId,
      sentAt: new Date(message.sentAt),
      editedAt: message.editedAt ? new Date(message.editedAt) : null,
      text: message.text,
      quotedExternalMessageId: message.quotedExternalId,
      reactions: message.reactions,
      mediaObjectIds: message.mediaObjectIds,
      attributes: message.attributes,
    }))).onConflictDoNothing().returning({ id: importStagedMessages.id })
    // 前のジョブで一時保管したまま公開していない行は、このジョブのエクスポートにも含まれたものだけをこのジョブの分にする。
    // 公開はジョブの分だけを対象にするので、前のジョブで別のチャンネル（非公開など）向けに置いた行を、
    // このジョブの取り込み先へ持ち出さない
    await tx.update(importStagedMessages).set({ jobId }).where(and(
      eq(importStagedMessages.workspaceId, workspaceId),
      eq(importStagedMessages.source, job.source),
      eq(importStagedMessages.externalConversationId, input.conversationExternalId),
      inArray(importStagedMessages.externalMessageId, input.messages.map(message => message.externalId)),
      isNull(importStagedMessages.publishedMessageId),
      ne(importStagedMessages.jobId, jobId),
    ))

    // 取り込み済みのメッセージでも、後のエクスポートで分かった画像の参照を足す（公開し直すと添付を補えるように）。既存の順は保つ
    const withMedia = input.messages.filter(message => message.mediaObjectIds.length > 0)
    if (withMedia.length > 0) {
      const incoming = sql.join(withMedia.map(message => sql`(${message.externalId}::text, ${JSON.stringify(message.mediaObjectIds)}::jsonb)`), sql`, `)
      await tx.execute(sql`
        update import_staged_messages s
        set media_object_ids = s.media_object_ids || coalesce(
          (select jsonb_agg(e) from jsonb_array_elements(v.ids) e where not s.media_object_ids @> jsonb_build_array(e)),
          '[]'::jsonb)
        from (values ${incoming}) as v(external_message_id, ids)
        where s.workspace_id = ${workspaceId} and s.source = ${job.source}
          and s.external_conversation_id = ${input.conversationExternalId}
          and s.external_message_id = v.external_message_id
          and not s.media_object_ids @> v.ids
      `)
    }

    const result = { staged: inserted.length, duplicates: input.messages.length - inserted.length }
    await tx.update(importJobConversations).set({
      status: 'running',
      importedMessages: sql`${importJobConversations.importedMessages} + ${result.staged}`,
      duplicateMessages: sql`${importJobConversations.duplicateMessages} + ${result.duplicates}`,
      updatedAt: new Date(),
    }).where(eq(importJobConversations.id, conversation.id))
    return result
  })
}

export interface PublishBatchResult {
  published: number
  held: number
  alreadyPublished: number
  attachments: number
  missingMedia: number
  reactions: number
  quotesLinked: number
  quotesUnresolved: number
  /** 続きがあれば次の呼び出しに渡す。無ければ null */
  nextCursor: { sentAt: string; externalMessageId: string } | null
}

interface StagedReaction {
  identityKey: string
  emoji: string
  reactedAt: string
}

/**
 * 一時保管した会話のメッセージを、発言者を確定したうえで messages に移す（最大 MAX_BATCH_MESSAGES 件ずつ）。
 * - 送信者は紐づけた Cairn ユーザー本人か、投稿者ごとの取り込み用プロフィール。表示時の差し替えは無い
 * - 投稿者不明の投稿は、会話の unknown_policy が hold なら残す（後で発言者が分かったら公開する）
 * - 通常の投稿 API を使わず、Inngest の message/created を出さない（通知・AI の巡回・埋め込みは動かない）
 * - メッセージ ID は取り込み元のキーから決める。何度公開し直しても二重にならない
 * - 公開済みのメッセージにも、前回そろっていなかった画像の添付を補う
 */
export async function publishConversationBatch(
  workspaceId: string,
  userId: string,
  jobId: string,
  input: PublishBatchInput,
): Promise<PublishBatchResult> {
  const {
    db, channels, messages, messageReactions, messageAttachments, importStagedMessages, importIdentities,
    importedFiles, importedReactions, importJobConversations, orm,
  } = await loadDb()
  const { and, asc, eq, gt, inArray, isNotNull, or, sql } = orm
  const job = await loadRunningJob(db, workspaceId, jobId)
  const conversation = await loadJobConversation(db, jobId, input.conversationExternalId)
  const channelId = conversation.channelId
  await assertImportTargetChannels(db, workspaceId, userId, [channelId])

  const cursorCondition = input.cursor
    ? or(
        gt(importStagedMessages.sentAt, new Date(input.cursor.sentAt)),
        and(eq(importStagedMessages.sentAt, new Date(input.cursor.sentAt)), gt(importStagedMessages.externalMessageId, input.cursor.externalMessageId)),
      )
    : undefined
  const rows = await db
    .select({
      id: importStagedMessages.id,
      externalMessageId: importStagedMessages.externalMessageId,
      sentAt: importStagedMessages.sentAt,
      editedAt: importStagedMessages.editedAt,
      text: importStagedMessages.text,
      quoted: importStagedMessages.quotedExternalMessageId,
      reactions: importStagedMessages.reactions,
      mediaObjectIds: importStagedMessages.mediaObjectIds,
      publishedMessageId: importStagedMessages.publishedMessageId,
      identityKey: importIdentities.externalKey,
    })
    .from(importStagedMessages)
    .innerJoin(importIdentities, eq(importIdentities.id, importStagedMessages.identityId))
    .where(and(
      eq(importStagedMessages.workspaceId, workspaceId),
      eq(importStagedMessages.source, job.source),
      eq(importStagedMessages.externalConversationId, input.conversationExternalId),
      // 未公開の行はこのジョブで一時保管したものだけ（前のジョブで別の取り込み先向けに置いた行を公開しない）
      or(isNotNull(importStagedMessages.publishedMessageId), eq(importStagedMessages.jobId, job.id)),
      cursorCondition,
    ))
    .orderBy(asc(importStagedMessages.sentAt), asc(importStagedMessages.externalMessageId))
    .limit(MAX_BATCH_MESSAGES + 1)
  const batch = rows.slice(0, MAX_BATCH_MESSAGES)
  const last = batch[batch.length - 1]
  const nextCursor = rows.length > MAX_BATCH_MESSAGES && last ? { sentAt: last.sentAt.toISOString(), externalMessageId: last.externalMessageId } : null

  const result: PublishBatchResult = { published: 0, held: 0, alreadyPublished: 0, attachments: 0, missingMedia: 0, reactions: 0, quotesLinked: 0, quotesUnresolved: 0, nextCursor }
  if (batch.length === 0) return result

  const reactionsOf = (value: unknown) => (Array.isArray(value) ? value as StagedReaction[] : [])
  const mediaOf = (value: unknown) => (Array.isArray(value) ? value.filter((id): id is string => typeof id === 'string') : [])
  const identityKeys = [...new Set(batch.flatMap(row => [row.identityKey, ...reactionsOf(row.reactions).map(r => r.identityKey)]))]
  const objectIds = [...new Set(batch.flatMap(row => mediaOf(row.mediaObjectIds)))]
  const idFor = (externalId: string) => importedMessageId(workspaceId, job.source, input.conversationExternalId, externalId)

  return db.transaction(async (tx) => {
    // 同じチャンネルへの並行した取り込みと投稿の順序を直列化する（通常の投稿と同じロック）
    await tx.select({ id: channels.id }).from(channels).where(eq(channels.id, channelId)).for('update')
    // 公開中に紐づけが変わって古い送信者で入らないよう、送信者を決める投稿者をコミットまでロックする
    const identities = await loadIdentities(tx, workspaceId, job.source, identityKeys, { lock: true })
    const fileRows = objectIds.length > 0
      ? await tx
          .select({ objectId: importedFiles.externalObjectId, fileId: importedFiles.fileId })
          .from(importedFiles)
          // 取り込み先と同じチャンネルにアップロードしたファイルだけを添付する（別チャンネルのファイルを持ち込ませない）
          .where(and(eq(importedFiles.workspaceId, workspaceId), eq(importedFiles.source, job.source), eq(importedFiles.channelId, channelId), inArray(importedFiles.externalObjectId, objectIds)))
      : []
    const fileIdByObject = new Map(fileRows.map(row => [row.objectId, row.fileId]))

    const toPublish = batch.filter(row => {
      if (row.publishedMessageId) {
        result.alreadyPublished++
        return false
      }
      if (identities.get(row.identityKey)?.isAnonymous && conversation.unknownPolicy === 'hold') {
        result.held++
        return false
      }
      return true
    })

    // 引用元: 同じチャンネルに公開済みか、このバッチで先に公開するものだけ。推定はしない
    const quotedUuids = [...new Set(toPublish.map(row => row.quoted).filter((id): id is string => !!id).map(idFor))]
    const existingQuoted = quotedUuids.length > 0
      ? new Set((await tx.select({ id: messages.id }).from(messages).where(and(inArray(messages.id, quotedUuids), eq(messages.channelId, channelId)))).map(row => row.id))
      : new Set<string>()
    const publishingIds = new Set(toPublish.map(row => row.externalMessageId))

    const messageRows = []
    for (const row of toPublish) {
      const identity = identities.get(row.identityKey)
      if (!identity) throw new Error('staged message identity not found')
      let parentMessageId: string | null = null
      if (row.quoted) {
        const target = idFor(row.quoted)
        if (existingQuoted.has(target) || publishingIds.has(row.quoted)) {
          parentMessageId = target
          result.quotesLinked++
        } else {
          result.quotesUnresolved++
        }
      }
      messageRows.push({
        id: idFor(row.externalMessageId),
        channelId,
        senderId: await senderFor(tx, identity),
        messageType: 'text' as const,
        content: row.text,
        parentMessageId,
        imported: true,
        createdAt: row.sentAt,
        updatedAt: row.editedAt && row.editedAt > row.sentAt ? row.editedAt : row.sentAt,
      })
    }
    if (messageRows.length > 0) {
      await tx.insert(messages).values(messageRows).onConflictDoNothing({ target: messages.id })
    }
    // ID が決まっているので、別の会話・チャンネルに同じ ID の行があった場合は、このチャンネルの行だけを公開済みにする
    const published = messageRows.length > 0
      ? new Set((await tx.select({ id: messages.id }).from(messages).where(and(inArray(messages.id, messageRows.map(m => m.id)), eq(messages.channelId, channelId)))).map(row => row.id))
      : new Set<string>()
    const now = new Date()
    for (const row of toPublish) {
      const messageId = idFor(row.externalMessageId)
      if (!published.has(messageId)) continue
      await tx.update(importStagedMessages).set({ publishedMessageId: messageId, publishedAt: now }).where(eq(importStagedMessages.id, row.id))
      result.published++
    }

    // リアクションと画像は、公開済みのメッセージすべてに対して補う（再実行で画像がそろった場合など）
    // 前のジョブで同じ会話を別のチャンネルに公開していた場合、その行のメッセージは別チャンネルにある。
    // このチャンネルのファイルやリアクションを別チャンネルのメッセージに付けないよう、このチャンネルのメッセージだけを対象にする
    const candidates = batch
      .map(row => ({ row, messageId: row.publishedMessageId ?? (published.has(idFor(row.externalMessageId)) ? idFor(row.externalMessageId) : null) }))
      .filter((entry): entry is { row: typeof batch[number]; messageId: string } => !!entry.messageId)
    const inChannel = candidates.length > 0
      ? new Set((await tx.select({ id: messages.id }).from(messages).where(and(inArray(messages.id, candidates.map(c => c.messageId)), eq(messages.channelId, channelId)))).map(row => row.id))
      : new Set<string>()
    const live = candidates.filter(entry => inChannel.has(entry.messageId))

    const reactionRows: Array<{ messageId: string; userId: string; emoji: string; createdAt: Date }> = []
    const reactorByKey = new Map<string, string>()
    for (const { row, messageId } of live) {
      for (const reaction of reactionsOf(row.reactions)) {
        const reactor = identities.get(reaction.identityKey)
        if (!reactor) continue
        const userId = await senderFor(tx, reactor)
        reactionRows.push({ messageId, userId, emoji: reaction.emoji, createdAt: new Date(reaction.reactedAt) })
        reactorByKey.set(`${messageId}\n${userId}\n${reaction.emoji}`, reactor.id)
      }
    }
    if (reactionRows.length > 0) {
      // 同じ人（投稿者不明は1つのプロフィール）の同じ絵文字は1件になる（一意制約）
      const inserted = await tx.insert(messageReactions).values(reactionRows).onConflictDoNothing()
        .returning({ id: messageReactions.id, messageId: messageReactions.messageId, userId: messageReactions.userId, emoji: messageReactions.emoji })
      result.reactions = inserted.length
      // 取り込みで作ったリアクションを記録する。紐づけの付け替え・解除ではこれだけを動かす
      const tracked = inserted.flatMap(reaction => {
        const identityId = reactorByKey.get(`${reaction.messageId}\n${reaction.userId}\n${reaction.emoji}`)
        return identityId ? [{ reactionId: reaction.id, workspaceId, identityId }] : []
      })
      if (tracked.length > 0) await tx.insert(importedReactions).values(tracked).onConflictDoNothing()
    }

    const liveIds = live.map(entry => entry.messageId)
    const attached = liveIds.length > 0
      ? await tx.select({ messageId: messageAttachments.messageId, fileId: messageAttachments.fileId }).from(messageAttachments).where(inArray(messageAttachments.messageId, liveIds))
      : []
    const attachedKeys = new Set(attached.map(row => `${row.messageId}:${row.fileId}`))
    const attachmentRows = live.flatMap(({ row, messageId }) => mediaOf(row.mediaObjectIds).flatMap((objectId, index) => {
      const fileId = fileIdByObject.get(objectId)
      if (!fileId) {
        result.missingMedia++
        return []
      }
      if (attachedKeys.has(`${messageId}:${fileId}`)) return []
      attachedKeys.add(`${messageId}:${fileId}`)
      return [{ messageId, fileId, displayOrder: index }]
    }))
    if (attachmentRows.length > 0) {
      await tx.insert(messageAttachments).values(attachmentRows)
      result.attachments = attachmentRows.length
    }

    await tx.update(importJobConversations).set({
      publishedMessages: sql`${importJobConversations.publishedMessages} + ${result.published}`,
      updatedAt: new Date(),
    }).where(eq(importJobConversations.id, conversation.id))
    return result
  })
}

/**
 * 投稿者の公開済みメッセージとリアクションの送信者を、from から to へ付け替える。
 * 投稿は一時保管の行、リアクションは imported_reactions（取り込みで作ったもの）から決め、Cairn で投稿・リアクションしたものは変えない
 */
/**
 * 投稿者の送信者を、紐づけ先（userId）か取り込み用プロフィール（null）にそろえる。
 * 公開済みの投稿・取り込みのリアクションを付け替えたあと、リアクションを一時保管の内容から同期し直す
 * （紐づけ先が同じ絵文字を付けていて畳んだリアクションを、解除や付け替えで戻すため）
 */
async function applyIdentitySender(tx: Tx, identity: IdentityRow, userId: string | null) {
  const from = identity.linkedUserId ?? identity.profileId
  const to = userId ?? await ensureIdentityProfile(tx, identity)
  const moved = from ? await reassignIdentityContent(tx, identity, from, to) : { messages: 0, reactions: 0 }
  identity.linkedUserId = userId
  await syncIdentityReactions(tx, identity, to)
  // from が Cairn ユーザーなら、同じ人に紐づいている他の投稿者のリアクションも戻す（2人を1人に紐づけて畳んでいた場合）
  if (from && from !== identity.profileId) {
    const { importIdentities, orm } = await loadDb()
    const { and, eq, ne } = orm
    const others = await tx
      .select({
        id: importIdentities.id,
        externalKey: importIdentities.externalKey,
        displayName: importIdentities.displayName,
        isAnonymous: importIdentities.isAnonymous,
        kind: importIdentities.kind,
        profileId: importIdentities.profileId,
        linkedUserId: importIdentities.linkedUserId,
        workspaceId: importIdentities.workspaceId,
        source: importIdentities.source,
      })
      .from(importIdentities)
      // 同じユーザーが他のワークスペースでも紐づいていることがあるので、このワークスペース・取り込み元に限る
      .where(and(
        eq(importIdentities.workspaceId, identity.workspaceId),
        eq(importIdentities.source, identity.source),
        eq(importIdentities.linkedUserId, from),
        ne(importIdentities.id, identity.id),
      ))
    for (const other of others) await syncIdentityReactions(tx, other, from)
  }
  return moved
}

/**
 * 投稿者のリアクションを、一時保管の内容どおりに sender で付け直す。足りないものだけを作り、取り込みのリアクションとして記録する。
 * sender が同じ絵文字を既に付けていれば作らない（本人のリアクションや他の投稿者のリアクションは動かさない）
 */
async function syncIdentityReactions(tx: Tx, identity: IdentityRow, sender: string) {
  const { messageReactions, importStagedMessages, importedReactions, orm } = await loadDb()
  const { and, eq, inArray, isNotNull, sql } = orm
  const owner = { workspaceId: identity.workspaceId, source: identity.source }
  const rows = await tx
    .select({ messageId: importStagedMessages.publishedMessageId, reactions: importStagedMessages.reactions })
    .from(importStagedMessages)
    .where(and(
      eq(importStagedMessages.workspaceId, owner.workspaceId),
      eq(importStagedMessages.source, owner.source),
      isNotNull(importStagedMessages.publishedMessageId),
      sql`${importStagedMessages.reactions} @> ${JSON.stringify([{ identityKey: identity.externalKey }])}::jsonb`,
    ))
  const wanted = rows.flatMap(row => (row.messageId ? (Array.isArray(row.reactions) ? row.reactions as StagedReaction[] : [])
    .filter(r => r.identityKey === identity.externalKey)
    .map(r => ({ messageId: row.messageId!, emoji: r.emoji, createdAt: new Date(r.reactedAt) })) : []))
  if (wanted.length === 0) return
  const existing = await tx
    .select({ messageId: messageReactions.messageId, emoji: messageReactions.emoji })
    .from(messageReactions)
    .where(and(eq(messageReactions.userId, sender), inArray(messageReactions.messageId, [...new Set(wanted.map(w => w.messageId))])))
  const taken = new Set(existing.map(r => `${r.messageId}\n${r.emoji}`))
  const missing = [...new Map(wanted.filter(w => !taken.has(`${w.messageId}\n${w.emoji}`)).map(w => [`${w.messageId}\n${w.emoji}`, w])).values()]
  if (missing.length === 0) return
  const inserted = await tx.insert(messageReactions)
    .values(missing.map(w => ({ messageId: w.messageId, userId: sender, emoji: w.emoji, createdAt: w.createdAt })))
    .onConflictDoNothing()
    .returning({ id: messageReactions.id })
  if (inserted.length > 0) {
    await tx.insert(importedReactions).values(inserted.map(r => ({ reactionId: r.id, workspaceId: owner.workspaceId, identityId: identity.id }))).onConflictDoNothing()
  }
}

async function reassignIdentityContent(tx: Tx, identity: IdentityRow, from: string, to: string) {
  const { messages, messageReactions, importStagedMessages, importedReactions, orm } = await loadDb()
  const { and, eq, inArray, isNotNull } = orm
  if (from === to) return { messages: 0, reactions: 0 }

  const authored = await tx
    .select({ messageId: importStagedMessages.publishedMessageId })
    .from(importStagedMessages)
    .where(and(eq(importStagedMessages.identityId, identity.id), isNotNull(importStagedMessages.publishedMessageId)))
  const authoredIds = authored.map(row => row.messageId).filter((id): id is string => !!id)
  let movedMessages = 0
  if (authoredIds.length > 0) {
    const moved = await tx.update(messages).set({ senderId: to })
      .where(and(inArray(messages.id, authoredIds), eq(messages.senderId, from), eq(messages.imported, true)))
      .returning({ id: messages.id })
    movedMessages = moved.length
  }

  // この投稿者のリアクションのうち、取り込みで作ったものだけを動かす（本人が Cairn で付けたリアクションは変えない）
  const tracked = await tx
    .select({ id: messageReactions.id, messageId: messageReactions.messageId, emoji: messageReactions.emoji })
    .from(importedReactions)
    .innerJoin(messageReactions, eq(messageReactions.id, importedReactions.reactionId))
    .where(and(eq(importedReactions.identityId, identity.id), eq(messageReactions.userId, from)))
  let movedReactions = 0
  if (tracked.length > 0) {
    // 付け替え先が同じメッセージに同じ絵文字を既に付けていたら、取り込みのリアクションの方を消す（一意制約）
    const existing = await tx
      .select({ messageId: messageReactions.messageId, emoji: messageReactions.emoji })
      .from(messageReactions)
      .where(and(eq(messageReactions.userId, to), inArray(messageReactions.messageId, [...new Set(tracked.map(r => r.messageId))])))
    const taken = new Set(existing.map(r => `${r.messageId}\n${r.emoji}`))
    const duplicateIds = tracked.filter(r => taken.has(`${r.messageId}\n${r.emoji}`)).map(r => r.id)
    const movableIds = tracked.filter(r => !taken.has(`${r.messageId}\n${r.emoji}`)).map(r => r.id)
    if (duplicateIds.length > 0) await tx.delete(messageReactions).where(inArray(messageReactions.id, duplicateIds))
    if (movableIds.length > 0) {
      const moved = await tx.update(messageReactions).set({ userId: to }).where(inArray(messageReactions.id, movableIds)).returning({ id: messageReactions.id })
      movedReactions = moved.length
    }
  }
  return { messages: movedMessages, reactions: movedReactions }
}

export async function lookupImportedMedia(workspaceId: string, jobId: string, channelId: string, objectIds: string[]) {
  const { db, importedFiles, importJobConversations, files, orm } = await loadDb()
  const { and, eq, inArray } = orm
  const job = await loadRunningJob(db, workspaceId, jobId)
  const [target] = await db
    .select({ channelId: importJobConversations.channelId })
    .from(importJobConversations)
    .where(and(eq(importJobConversations.jobId, jobId), eq(importJobConversations.channelId, channelId)))
    .limit(1)
  if (!target) throw new ImportServiceError(400, 'このジョブの取り込み先ではないチャンネルです')
  const rows = await db
    .select({ objectId: importedFiles.externalObjectId, fileId: importedFiles.fileId })
    .from(importedFiles)
    .innerJoin(files, eq(files.id, importedFiles.fileId))
    .where(and(eq(importedFiles.workspaceId, workspaceId), eq(importedFiles.source, job.source), eq(importedFiles.channelId, channelId), inArray(importedFiles.externalObjectId, objectIds)))
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
    .where(and(eq(importedFiles.workspaceId, workspaceId), eq(importedFiles.source, job.source), eq(importedFiles.channelId, input.channelId), eq(importedFiles.externalObjectId, input.objectId)))
    .limit(1)
  if (!existing) throw new Error('imported file lookup failed after conflict')
  return { fileId: existing.fileId, reused: true }
}

/**
 * ジョブを終える。取り込み先のチャンネルは、過去ログが未読として一気に積まれないよう既読位置を置く。
 * AI の巡回位置は触らない（巡回のクエリが過去ログの印 messages.imported で除外する。位置を進めると、まだ評価していない
 * Cairn での投稿まで巡回済みになってしまう）
 */
export async function completeImportJob(workspaceId: string, jobId: string, input: CompleteImportJobInput) {
  const { db, importJobs, importJobConversations, channels, channelMembers, channelReadStates, messages, activeWorkspaceMembers, orm } = await loadDb()
  const { and, asc, eq, inArray, ne, sql } = orm
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
        // 全件が一時保管済み（重複を含む）でなければ、途中で止まった会話として残す。再実行で続きから入る
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
          // 既読位置がまだ無い人だけ。既にある人は取り込んだ過去ログ（作成日時が古い）より後を読んでいる。
          // Cairn で投稿されたメッセージがあるチャンネルでは、その最初の投稿の直前を既読位置にし、
          // チャンネルを開いたことのない人の本当の未読（取り込み中の投稿を含む）を既読にしない
          const [earliestLive] = await tx
            .select({ createdAt: messages.createdAt })
            .from(messages)
            .where(and(eq(messages.channelId, channel.id), eq(messages.imported, false)))
            .orderBy(asc(messages.createdAt))
            .limit(1)
          const lastReadAt = earliestLive ? new Date(earliestLive.createdAt.getTime() - 1) : new Date()
          await tx.insert(channelReadStates)
            .values(readers.map(reader => ({ userId: reader.userId, channelId: channel.id, lastReadAt })))
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
      publishedMessages: importJobConversations.publishedMessages,
      unknownPolicy: importJobConversations.unknownPolicy,
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
  const { db, importIdentities, importStagedMessages, workspaceMembers, profiles, orm } = await loadDb()
  const { and, eq, sql } = orm
  return db
    .select({
      id: importIdentities.id,
      key: importIdentities.externalKey,
      displayName: importIdentities.displayName,
      isAnonymous: importIdentities.isAnonymous,
      kind: importIdentities.kind,
      linkedUserId: importIdentities.linkedUserId,
      linkedUserName: sql<string | null>`coalesce(${workspaceMembers.displayName}, ${profiles.displayName})`,
      messageCount: sql<number>`(select count(*)::int from ${importStagedMessages} where ${importStagedMessages.identityId} = ${importIdentities.id})`,
      publishedCount: sql<number>`(select count(*)::int from ${importStagedMessages} where ${importStagedMessages.identityId} = ${importIdentities.id} and ${importStagedMessages.publishedMessageId} is not null)`,
      // リアクションだけの参加者も紐づけの一覧に出すため、リアクションを付けた公開済みの投稿の件数も返す
      reactedCount: sql<number>`(select count(*)::int from ${importStagedMessages} where ${importStagedMessages.workspaceId} = ${importIdentities.workspaceId} and ${importStagedMessages.source} = ${importIdentities.source} and ${importStagedMessages.publishedMessageId} is not null and ${importStagedMessages.reactions} @> jsonb_build_array(jsonb_build_object('identityKey', ${importIdentities.externalKey})))`,
    })
    .from(importIdentities)
    .leftJoin(profiles, eq(profiles.id, importIdentities.linkedUserId))
    .leftJoin(workspaceMembers, and(eq(workspaceMembers.userId, importIdentities.linkedUserId), eq(workspaceMembers.workspaceId, workspaceId)))
    .where(and(eq(importIdentities.workspaceId, workspaceId), eq(importIdentities.source, source)))
}

async function loadIdentityById(db: Db | Tx, workspaceId: string, identityId: string, options?: { lock?: boolean }): Promise<IdentityRow> {
  const { importIdentities, orm } = await loadDb()
  const { and, eq } = orm
  const query = db
    .select({
      id: importIdentities.id,
      workspaceId: importIdentities.workspaceId,
      source: importIdentities.source,
      externalKey: importIdentities.externalKey,
      displayName: importIdentities.displayName,
      isAnonymous: importIdentities.isAnonymous,
      kind: importIdentities.kind,
      profileId: importIdentities.profileId,
      linkedUserId: importIdentities.linkedUserId,
    })
    .from(importIdentities)
    .where(and(eq(importIdentities.id, identityId), eq(importIdentities.workspaceId, workspaceId)))
    .limit(1)
  const [identity] = options?.lock ? await query.for('update') : await query
  if (!identity) throw new ImportServiceError(404, '投稿者が見つかりません')
  return identity
}

/**
 * 投稿者を Cairn のメンバーに紐づける・付け替える・外す（owner / admin）。投稿者不明は紐づけられない。
 * 公開済みのメッセージとリアクションの送信者も付け替える（紐づけた本人 ⇔ 投稿者ごとの取り込み用プロフィール）。通知は出さない
 */
export async function linkImportIdentity(workspaceId: string, actorId: string, identityId: string, userId: string | null) {
  const { db, importIdentities, activeWorkspaceMembers, orm } = await loadDb()
  const { and, eq } = orm
  const identity = await loadIdentityById(db, workspaceId, identityId)
  if (identity.isAnonymous && userId) throw new ImportServiceError(400, '投稿者不明は Cairn のユーザーに紐づけられません')
  if (userId) {
    const [member] = await db
      .select({ userId: activeWorkspaceMembers.userId })
      .from(activeWorkspaceMembers)
      .where(and(eq(activeWorkspaceMembers.workspaceId, workspaceId), eq(activeWorkspaceMembers.userId, userId)))
      .limit(1)
    if (!member) throw new ImportServiceError(400, '紐づけ先はこのワークスペースのメンバーにしてください')
  }
  return db.transaction(async (tx) => {
    // 同じ投稿者への同時の変更で古い送信者から付け替えないよう、トランザクション内でロックして読み直す
    const current = await loadIdentityById(tx, workspaceId, identityId, { lock: true })
    const moved = await applyIdentitySender(tx, current, userId)
    await tx.update(importIdentities)
      .set(userId ? { linkedUserId: userId, linkedBy: actorId, linkedAt: new Date() } : { linkedUserId: null, linkedBy: null, linkedAt: null })
      .where(eq(importIdentities.id, identityId))
    return moved
  })
}

/**
 * 投稿者不明の投稿の発言者を、外部データ（ブラウザのキャッシュ・他の参加者のエクスポート）から補う（運営者）。
 * 一時保管の行の投稿者を差し替え、投稿者不明として公開済みなら送信者も付け替える。残していた投稿は次の公開で出る。
 * 投稿者不明でない行（既に発言者が確定している行）は変えない
 */
export async function resolveUnknownMessages(workspaceId: string, input: ResolveUnknownInput) {
  const { db, importIdentities, importStagedMessages, messages, orm } = await loadDb()
  const { and, eq, inArray, sql } = orm
  if (input.assignments.some(a => a.identity.anonymous)) throw new ImportServiceError(400, '補う発言者に投稿者不明は指定できません')
  return db.transaction(async (tx) => {
    const identities = [...new Map(input.assignments.map(a => [a.identity.key, a.identity])).values()]
    await tx.insert(importIdentities).values(identities.map(identity => ({
      workspaceId,
      source: input.source,
      externalKey: identity.key,
      displayName: identity.displayName,
      isAnonymous: false,
      kind: identity.kind,
    }))).onConflictDoUpdate({
      target: [importIdentities.workspaceId, importIdentities.source, importIdentities.externalKey],
      set: { displayName: sql`coalesce(excluded.display_name, ${importIdentities.displayName})` },
    })
    await syncImportProfileNames(tx, workspaceId, input.source, identities.map(i => i.key))
    const identityByKey = await loadIdentities(tx, workspaceId, input.source, identities.map(i => i.key))
    const rows = await tx
      .select({ id: importStagedMessages.id, externalMessageId: importStagedMessages.externalMessageId, publishedMessageId: importStagedMessages.publishedMessageId, isAnonymous: importIdentities.isAnonymous, anonymousProfileId: importIdentities.profileId })
      .from(importStagedMessages)
      .innerJoin(importIdentities, eq(importIdentities.id, importStagedMessages.identityId))
      .where(and(
        eq(importStagedMessages.workspaceId, workspaceId),
        eq(importStagedMessages.source, input.source),
        eq(importStagedMessages.externalConversationId, input.conversationExternalId),
        inArray(importStagedMessages.externalMessageId, input.assignments.map(a => a.externalMessageId)),
      ))
    const rowByExternalId = new Map(rows.map(row => [row.externalMessageId, row]))
    const result = { resolved: 0, republished: 0, skipped: 0 }
    for (const assignment of input.assignments) {
      const row = rowByExternalId.get(assignment.externalMessageId)
      const identity = identityByKey.get(assignment.identity.key)
      if (!row || !identity || !row.isAnonymous) {
        result.skipped++
        continue
      }
      await tx.update(importStagedMessages).set({ identityId: identity.id }).where(eq(importStagedMessages.id, row.id))
      result.resolved++
      if (row.publishedMessageId && row.anonymousProfileId) {
        const updated = await tx.update(messages).set({ senderId: await senderFor(tx, identity) })
          .where(and(eq(messages.id, row.publishedMessageId), eq(messages.senderId, row.anonymousProfileId), eq(messages.imported, true)))
          .returning({ id: messages.id })
        result.republished += updated.length
      }
    }
    return result
  })
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
