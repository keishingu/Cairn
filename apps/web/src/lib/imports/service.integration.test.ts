// @vitest-environment node
// Copyright 2026 Cairn Contributors
// SPDX-License-Identifier: Apache-2.0

/**
 * 取り込みサービスの結合テスト。ローカルの Supabase（supabase start）に対して実際に書き込む。
 * IMPORT_INTEGRATION_DATABASE_URL を指定したときだけ動く（CI と通常の `pnpm test` では飛ばす）。
 * 本番や共有の DB を指定しないこと。テスト用のワークスペースを作り、最後に消す。
 *
 *   IMPORT_INTEGRATION_DATABASE_URL=postgresql://postgres:postgres@127.0.0.1:54322/postgres \
 *     pnpm --filter @cairn/web exec vitest run src/lib/imports/service.integration.test.ts
 */

import { readFileSync } from 'node:fs'
import { join } from 'node:path'
import { randomUUID } from 'node:crypto'
import { afterAll, beforeAll, describe, expect, test, vi } from 'vitest'
import { parseTeamsExport } from '@cairn/core/import'
import { identitiesForConversations, toBatchMessage } from './client-runner'

const DATABASE_URL = process.env['IMPORT_INTEGRATION_DATABASE_URL']
const runIntegration = !!DATABASE_URL && /@(127\.0\.0\.1|localhost):/.test(DATABASE_URL)

const { mockInngestSend } = vi.hoisted(() => ({ mockInngestSend: vi.fn() }))
vi.mock('@/lib/inngest/client', () => ({ inngest: { send: mockInngestSend } }))

const fixture = JSON.parse(readFileSync(join(__dirname, '../../../../../packages/core/src/import/teams/__fixtures__/messages.json'), 'utf8')) as unknown
const COMMUNITY = '19:FixtureCommunityAAAAAAAAAAAAAAAAAAAAAAAAAAA1@thread.v2'
const MEDIA_ID = '0-wus-d1-aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa'

describe.skipIf(!runIntegration)('取り込みサービス（ローカル DB との結合）', { timeout: 60_000 }, () => {
  const workspaceId = randomUUID()
  const otherWorkspaceId = randomUUID()
  const adminId = randomUUID()
  const memberId = randomUUID()
  const channelId = randomUUID()
  const otherChannelId = randomUUID()
  const publicChannelId = randomUUID()
  const fileId = randomUUID()
  const bundle = parseTeamsExport(fixture, { timeZone: 'Asia/Tokyo' })
  const messages = bundle.messagesByConversation[COMMUNITY]!
  const identities = identitiesForConversations(bundle, [COMMUNITY]).map(row => row.identity)
  type Service = typeof import('./service')
  let service: Service
  let db: Awaited<typeof import('@cairn/db')>
  let sql: (typeof import('drizzle-orm'))['sql']

  beforeAll(async () => {
    process.env['DATABASE_URL'] = DATABASE_URL
    db = await import('@cairn/db')
    sql = (await import('drizzle-orm')).sql
    service = await import('./service')
    const { workspaces, profiles, workspaceMembers, channels, channelMembers, files } = db
    await db.db.insert(profiles).values([
      { id: adminId, displayName: 'テスト管理者' },
      { id: memberId, displayName: 'Hanako Sato' },
    ])
    await db.db.insert(workspaces).values([
      { id: workspaceId, name: '取り込みテスト', slug: `import-test-${workspaceId.slice(0, 8)}`, createdBy: adminId },
      { id: otherWorkspaceId, name: '別ワークスペース', slug: `import-other-${otherWorkspaceId.slice(0, 8)}`, createdBy: adminId },
    ])
    await db.db.insert(workspaceMembers).values([
      { workspaceId, userId: adminId, role: 'admin' },
      { workspaceId, userId: memberId, role: 'member' },
      { workspaceId: otherWorkspaceId, userId: adminId, role: 'admin' },
    ])
    await db.db.insert(channels).values([
      { id: channelId, workspaceId, type: 'workspace', name: '取り込み先', isPrivate: true },
      { id: otherChannelId, workspaceId: otherWorkspaceId, type: 'workspace', name: '別WS', isPrivate: false },
      { id: publicChannelId, workspaceId, type: 'workspace', name: '公開チャンネル', isPrivate: false },
    ])
    await db.db.insert(channelMembers).values({ channelId, userId: adminId })
    await db.db.insert(files).values({
      id: fileId,
      workspaceId,
      uploadedBy: adminId,
      storagePath: `${workspaceId}/${channelId}/${adminId}/test.jpg`,
      fileName: 'test.jpg',
      mimeType: 'image/jpeg',
      fileSize: 10,
      fileType: 'image',
    })
  // 初回は @cairn/db のスキーマの変換に時間がかかる
  }, 120_000)

  afterAll(async () => {
    if (!db) return
    const { workspaces, profiles } = db
    const { inArray } = await import('drizzle-orm')
    // 取り込み用プロフィールはワークスペースのメンバーではないので、ワークスペースを消したあとに別に消す
    const importProfiles = (await db.db.execute(sql`select profile_id from import_identities where workspace_id = ${workspaceId} and profile_id is not null`)).rows.map(r => (r as { profile_id: string }).profile_id)
    await db.db.delete(workspaces).where(inArray(workspaces.id, [workspaceId, otherWorkspaceId]))
    await db.db.delete(profiles).where(inArray(profiles.id, [adminId, memberId, ...importProfiles]))
  })

  async function count(query: ReturnType<typeof sql>) {
    const result = await db.db.execute(query)
    return Number((result.rows[0] as { n: string | number }).n)
  }

  const emptyReport = { conversations: [], excludedConversations: {}, mediaFailures: [] }

  async function createJob(options: { conversation?: string; channel?: string; unknownPolicy?: 'include_unknown' | 'hold'; links?: Array<{ key: string; userId: string }> } = {}) {
    return service.createImportJob(workspaceId, adminId, {
      source: 'teams-consumer',
      exportedAt: bundle.exportedAt,
      conversations: [{ externalId: options.conversation ?? COMMUNITY, channelId: options.channel ?? channelId, totalMessages: messages.length, unknownPolicy: options.unknownPolicy ?? 'include_unknown' }],
      identities,
      links: options.links ?? [],
    })
  }

  const stageBody = (conversation = COMMUNITY, subset = messages) => ({
    conversationExternalId: conversation,
    messages: subset.map(m => toBatchMessage(m, null)),
  })

  async function publishAll(jobId: string, conversation = COMMUNITY) {
    const total = { published: 0, held: 0, alreadyPublished: 0, attachments: 0, missingMedia: 0, reactions: 0 }
    let cursor: { sentAt: string; externalMessageId: string } | null = null
    do {
      const result = await service.publishConversationBatch(workspaceId, adminId, jobId, { conversationExternalId: conversation, cursor })
      for (const key of Object.keys(total) as Array<keyof typeof total>) total[key] += result[key]
      cursor = result.nextCursor
    } while (cursor)
    return total
  }

  const senderOf = async (conversation: string, externalId: string) => {
    const row = (await db.db.execute(sql`
      select m.sender_id, p.kind, p.display_name from import_staged_messages s
      join messages m on m.id = s.published_message_id join profiles p on p.id = m.sender_id
      where s.workspace_id = ${workspaceId} and s.external_conversation_id = ${conversation} and s.external_message_id = ${externalId}`)).rows[0] as { sender_id: string; kind: string; display_name: string } | undefined
    return row
  }

  test('参加していない非公開チャンネル・他のワークスペースのチャンネルには取り込めない', async () => {
    await expect(service.createImportJob(workspaceId, memberId, {
      source: 'teams-consumer', exportedAt: null, conversations: [{ externalId: COMMUNITY, channelId, totalMessages: 1, unknownPolicy: 'include_unknown' }], identities, links: [],
    })).rejects.toMatchObject({ status: 403 })
    await expect(service.createImportJob(workspaceId, adminId, {
      source: 'teams-consumer', exportedAt: null, conversations: [{ externalId: COMMUNITY, channelId: otherChannelId, totalMessages: 1, unknownPolicy: 'include_unknown' }], identities, links: [],
    })).rejects.toMatchObject({ status: 400 })
  })

  test('投稿者不明は Cairn のユーザーに紐づけられない', async () => {
    await expect(createJob({ links: [{ key: 'anonymous', userId: memberId }] })).rejects.toMatchObject({ status: 400 })
  })

  test('一時保管の段階ではチャンネルに何も出ず、中断後の再実行でも二重に保管しない', async () => {
    const { jobId } = await createJob()
    await service.registerImportedMedia(workspaceId, adminId, jobId, { objectId: MEDIA_ID, fileId, channelId })
    expect(await service.stageMessageBatch(workspaceId, adminId, jobId, stageBody(COMMUNITY, messages.slice(0, 2)))).toEqual({ staged: 2, duplicates: 0 })
    await service.completeImportJob(workspaceId, jobId, { status: 'failed', error: '中断', report: emptyReport })
    await expect(service.stageMessageBatch(workspaceId, adminId, jobId, stageBody())).rejects.toMatchObject({ status: 409 })

    const { jobId: retryJob } = await createJob()
    expect(await service.stageMessageBatch(workspaceId, adminId, retryJob, stageBody())).toEqual({ staged: messages.length - 2, duplicates: 2 })
    expect(await count(sql`select count(*) as n from messages where channel_id = ${channelId}`)).toBe(0)
    expect(await count(sql`select count(*) as n from import_staged_messages where workspace_id = ${workspaceId}`)).toBe(messages.length)

    // 公開: 投稿者不明も「投稿者不明」として一緒に公開する
    const published = await publishAll(retryJob)
    expect(published).toMatchObject({ published: messages.length, held: 0, attachments: 2 })
    await service.completeImportJob(workspaceId, retryJob, { status: 'completed', error: null, report: emptyReport })
    expect(await count(sql`select count(*) as n from messages where channel_id = ${channelId} and imported`)).toBe(messages.length)
  })

  test('もう一度公開しても二重に投稿しない', async () => {
    const { jobId } = await createJob()
    expect(await publishAll(jobId)).toMatchObject({ published: 0, alreadyPublished: messages.length, attachments: 0 })
    expect(await count(sql`select count(*) as n from messages where channel_id = ${channelId}`)).toBe(messages.length)
    await service.completeImportJob(workspaceId, jobId, { status: 'completed', error: null, report: emptyReport })
  })

  test('送信者は投稿者ごとの取り込み用プロフィールになり、元の日時・本文・編集日時を保持する', async () => {
    const original = messages.find(m => m.externalId === '1760000500000')!
    const row = (await db.db.execute(sql`
      select m.content, m.created_at, m.updated_at, m.imported, p.kind, p.display_name
      from import_staged_messages s join messages m on m.id = s.published_message_id join profiles p on p.id = m.sender_id
      where s.workspace_id = ${workspaceId} and s.external_message_id = ${original.externalId}`)).rows[0] as Record<string, unknown>
    expect(row['content']).toBe(original.text)
    expect(new Date(row['created_at'] as string).toISOString()).toBe(original.sentAt)
    expect(new Date(row['updated_at'] as string).toISOString()).toBe(original.editedAt)
    expect(row).toMatchObject({ imported: true, kind: 'import', display_name: '山田 太郎' })
    expect(await senderOf(COMMUNITY, '1760000700000')).toMatchObject({ kind: 'import', display_name: '投稿者不明' })
    // 取り込み用プロフィールはワークスペースのメンバーにならない
    expect(await count(sql`select count(*) as n from workspace_members wm join profiles p on p.id = wm.user_id where wm.workspace_id = ${workspaceId} and p.kind = 'import'`)).toBe(0)
  })

  test('リアクションを通常のリアクションとして、取り込み元の人ごとに入れる（投稿者不明の同じ絵文字は1件になる）', async () => {
    const first = (await db.db.execute(sql`select published_message_id as id from import_staged_messages where workspace_id = ${workspaceId} and external_message_id = '1760000000000'`)).rows[0] as { id: string }
    // 👍 は山田・名前不明の参加者・投稿者不明の3人、✅ は Hanako
    expect(await count(sql`select count(*) as n from message_reactions where message_id = ${first.id}`)).toBe(4)
  })

  test('同じ画像を参照する複数のメッセージは、1つのファイルを共有して添付する', async () => {
    expect(await count(sql`select count(*) as n from message_attachments where file_id = ${fileId}`)).toBe(2)
  })

  test('過去ログの公開で通知・Inngest のイベントを出さない', async () => {
    expect(mockInngestSend).not.toHaveBeenCalled()
    expect(await count(sql`select count(*) as n from notifications where workspace_id = ${workspaceId}`)).toBe(0)
  })

  test('owner / admin が紐づけると送信者とリアクションが本人に付け替わり、外すと Teams の名前に戻る（本人が Cairn で付けたリアクションは動かさない）', async () => {
    const list = await service.listImportIdentities(workspaceId, 'teams-consumer')
    const hanako = list.find(i => i.key === 'name:Hanako Sato')!
    expect(hanako).toMatchObject({ messageCount: 1, publishedCount: 1, linkedUserId: null })
    const before = await senderOf(COMMUNITY, '1760000800000')
    expect(before).toMatchObject({ kind: 'import', display_name: 'Hanako Sato' })
    // 本人が Cairn で、取り込みの ✅ と同じメッセージに同じ ✅ を付けていた
    const first = (await db.db.execute(sql`select published_message_id as id from import_staged_messages where workspace_id = ${workspaceId} and external_conversation_id = ${COMMUNITY} and external_message_id = '1760000000000'`)).rows[0] as { id: string }
    await db.db.insert(db.messageReactions).values({ messageId: first.id, userId: memberId, emoji: '✅' })

    // 紐づけ: 投稿は本人に付け替わり、取り込みの ✅ は本人の ✅ と重なるので消える
    expect(await service.linkImportIdentity(workspaceId, adminId, hanako.id, memberId)).toEqual({ messages: 1, reactions: 0 })
    expect((await senderOf(COMMUNITY, '1760000800000'))?.sender_id).toBe(memberId)
    expect(await count(sql`select count(*) as n from message_reactions where message_id = ${first.id} and emoji = '✅'`)).toBe(1)

    // 解除: 投稿は Teams の名前に戻る。本人が Cairn で付けた ✅ は本人のまま、畳んでいた取り込みの ✅ は Teams の名前で戻る
    expect(await service.linkImportIdentity(workspaceId, adminId, hanako.id, null)).toEqual({ messages: 1, reactions: 0 })
    expect((await senderOf(COMMUNITY, '1760000800000'))?.sender_id).toBe(before!.sender_id)
    expect(await count(sql`select count(*) as n from message_reactions where message_id = ${first.id} and emoji = '✅' and user_id = ${memberId}`)).toBe(1)
    expect(await count(sql`select count(*) as n from message_reactions where message_id = ${first.id} and emoji = '✅' and user_id = ${before!.sender_id}`)).toBe(1)
    await db.db.execute(sql`delete from message_reactions where message_id = ${first.id} and user_id = ${memberId}`)
  })

  test('2人の投稿者を同じメンバーに紐づけて畳んだリアクションも、片方を外すと両方とも戻る', async () => {
    const list = await service.listImportIdentities(workspaceId, 'teams-consumer')
    const yamada = list.find(i => i.key === 'mri:8:live:.cid.00000000yamada')!
    const unnamed = list.find(i => i.key === 'mri:8:live:.cid.0000000unknown1')!
    const first = (await db.db.execute(sql`select published_message_id as id from import_staged_messages where workspace_id = ${workspaceId} and external_conversation_id = ${COMMUNITY} and external_message_id = '1760000000000'`)).rows[0] as { id: string }
    // どちらも 👍 を付けていた
    await service.linkImportIdentity(workspaceId, adminId, yamada.id, adminId)
    await service.linkImportIdentity(workspaceId, adminId, unnamed.id, adminId)
    expect(await count(sql`select count(*) as n from message_reactions where message_id = ${first.id} and emoji = '👍' and user_id = ${adminId}`)).toBe(1)
    // 山田を外すと、山田の 👍 は山田の名前に戻り、名前不明の参加者の 👍 は管理者（紐づけ先）に残る
    await service.linkImportIdentity(workspaceId, adminId, yamada.id, null)
    expect(await count(sql`select count(*) as n from message_reactions where message_id = ${first.id} and emoji = '👍' and user_id = ${adminId}`)).toBe(1)
    const yamadaProfile = (await db.db.execute(sql`select profile_id from import_identities where id = ${yamada.id}`)).rows[0] as { profile_id: string }
    expect(await count(sql`select count(*) as n from message_reactions where message_id = ${first.id} and emoji = '👍' and user_id = ${yamadaProfile.profile_id}`)).toBe(1)
    await service.linkImportIdentity(workspaceId, adminId, unnamed.id, null)
    expect(await count(sql`select count(*) as n from message_reactions where message_id = ${first.id} and user_id = ${adminId}`)).toBe(0)
    // 👍 は山田・名前不明の参加者・投稿者不明の3件に戻る
    expect(await count(sql`select count(*) as n from message_reactions where message_id = ${first.id} and emoji = '👍'`)).toBe(3)
  })

  test('再実行のジョブ作成で紐づけると、公開済みの投稿も本人に付け替わる', async () => {
    await createJob({ links: [{ key: 'name:Hanako Sato', userId: memberId }] })
    expect((await senderOf(COMMUNITY, '1760000800000'))?.sender_id).toBe(memberId)
    expect(await count(sql`select count(*) as n from message_reactions where user_id = ${memberId} and emoji = '✅'`)).toBe(1)
    const hanako = (await service.listImportIdentities(workspaceId, 'teams-consumer')).find(i => i.key === 'name:Hanako Sato')!
    await service.linkImportIdentity(workspaceId, adminId, hanako.id, null)
  })

  test('紐づけで取り込みのリアクションが本人に移り、解除で戻る', async () => {
    const yamada = (await service.listImportIdentities(workspaceId, 'teams-consumer')).find(i => i.key === 'mri:8:live:.cid.00000000yamada')!
    expect(await service.linkImportIdentity(workspaceId, adminId, yamada.id, adminId)).toEqual({ messages: 1, reactions: 1 })
    expect(await count(sql`select count(*) as n from message_reactions where user_id = ${adminId} and emoji = '👍'`)).toBe(1)
    expect(await service.linkImportIdentity(workspaceId, adminId, yamada.id, null)).toEqual({ messages: 1, reactions: 1 })
    expect(await count(sql`select count(*) as n from message_reactions where user_id = ${adminId}`)).toBe(0)
  })

  test('投稿者不明は紐づけられない', async () => {
    const anonymous = (await service.listImportIdentities(workspaceId, 'teams-consumer')).find(i => i.isAnonymous)!
    await expect(service.linkImportIdentity(workspaceId, adminId, anonymous.id, memberId)).rejects.toMatchObject({ status: 400 })
  })

  test('同じ投稿に別々の発言者を指定すると、何も変えずに拒否する', async () => {
    await expect(service.resolveUnknownMessages(workspaceId, adminId, {
      source: 'teams-consumer',
      conversationExternalId: COMMUNITY,
      assignments: [
        { externalMessageId: '1760000700000', identity: { key: 'mri:8:live:.cid.00000000dupa', displayName: 'A', anonymous: false, kind: 'named' } },
        { externalMessageId: '1760000700000', identity: { key: 'mri:8:live:.cid.00000000dupb', displayName: 'B', anonymous: false, kind: 'named' } },
      ],
    })).rejects.toMatchObject({ status: 400 })
    expect(await senderOf(COMMUNITY, '1760000700000')).toMatchObject({ display_name: '投稿者不明' })
  })

  test('投稿者不明として公開済みの投稿は、発言者を補うと送信者が付け替わる', async () => {
    const result = await service.resolveUnknownMessages(workspaceId, adminId, {
      source: 'teams-consumer',
      conversationExternalId: COMMUNITY,
      assignments: [{ externalMessageId: '1760000700000', identity: { key: 'mri:8:live:.cid.0000000resolved', displayName: '鈴木 次郎', anonymous: false, kind: 'named' } }],
    })
    expect(result).toEqual({ resolved: 1, republished: 1, published: 0, skipped: 0 })
    expect(await senderOf(COMMUNITY, '1760000700000')).toMatchObject({ kind: 'import', display_name: '鈴木 次郎' })
  })

  test('「残す」を選んだ会話では投稿者不明の投稿を公開せず、発言者を補ってから公開する。別チャンネルの画像は使い回さない', async () => {
    const heldConversation = '19:FixtureHeldCommunityBBBBBBBBBBBBBBBBBBBBBBB1@thread.v2'
    const { jobId } = await createJob({ conversation: heldConversation, channel: publicChannelId, unknownPolicy: 'hold' })
    await service.stageMessageBatch(workspaceId, adminId, jobId, stageBody(heldConversation))
    expect(await service.lookupImportedMedia(workspaceId, jobId, publicChannelId, [MEDIA_ID])).toEqual({})
    const first = await publishAll(jobId, heldConversation)
    expect(first).toMatchObject({ published: messages.length - 2, held: 2, attachments: 0 })
    expect(await count(sql`select count(*) as n from messages where channel_id = ${publicChannelId}`)).toBe(messages.length - 2)

    // ジョブを完了した後に発言者を補っても、取り込み直さずにその投稿だけ公開される
    await service.completeImportJob(workspaceId, jobId, { status: 'completed', error: null, report: emptyReport })
    expect(await service.resolveUnknownMessages(workspaceId, adminId, {
      source: 'teams-consumer',
      conversationExternalId: heldConversation,
      assignments: [{ externalMessageId: '1760000700000', identity: { key: 'mri:8:live:.cid.0000000resolved', displayName: '鈴木 次郎', anonymous: false, kind: 'named' } }],
    })).toMatchObject({ resolved: 1, published: 1 })
    expect(await senderOf(heldConversation, '1760000700000')).toMatchObject({ display_name: '鈴木 次郎' })
    expect(await publishAll(jobId, heldConversation)).toMatchObject({ published: 0, held: 1 })
  })

  test('同じ会話を別のチャンネルに公開し直しても、そのチャンネルのファイルを元のチャンネルのメッセージに付けない', async () => {
    const otherFileId = randomUUID()
    await db.db.insert(db.files).values({ id: otherFileId, workspaceId, uploadedBy: adminId, storagePath: `${workspaceId}/${publicChannelId}/${adminId}/other.jpg`, fileName: 'other.jpg', mimeType: 'image/jpeg', fileSize: 10, fileType: 'image' })
    const { jobId } = await createJob({ channel: publicChannelId })
    await service.registerImportedMedia(workspaceId, adminId, jobId, { objectId: MEDIA_ID, fileId: otherFileId, channelId: publicChannelId })
    expect(await publishAll(jobId)).toMatchObject({ published: 0, attachments: 0, reactions: 0 })
    expect(await count(sql`select count(*) as n from message_attachments where file_id = ${otherFileId}`)).toBe(0)
    await service.completeImportJob(workspaceId, jobId, { status: 'completed', error: null, report: emptyReport })
  })

  test('前のジョブで別のチャンネル向けに置いたまま公開していない投稿は、後のジョブのエクスポートに無ければ公開しない', async () => {
    const conversation = '19:FixtureStrandedCommunityDDDDDDDDDDDDDDDDDDDD1@thread.v2'
    const privateId = randomUUID()
    const publicId = randomUUID()
    await db.db.insert(db.channels).values([
      { id: privateId, workspaceId, type: 'workspace', name: '非公開', isPrivate: true },
      { id: publicId, workspaceId, type: 'workspace', name: '公開', isPrivate: false },
    ])
    await db.db.insert(db.channelMembers).values({ channelId: privateId, userId: adminId })
    const first = await createJob({ conversation, channel: privateId })
    await service.stageMessageBatch(workspaceId, adminId, first.jobId, stageBody(conversation))
    await service.completeImportJob(workspaceId, first.jobId, { status: 'failed', error: 'stopped', report: emptyReport })
    const second = await createJob({ conversation, channel: publicId })
    await service.stageMessageBatch(workspaceId, adminId, second.jobId, stageBody(conversation, messages.slice(0, 2)))
    expect(await publishAll(second.jobId, conversation)).toMatchObject({ published: 2 })
    expect(await count(sql`select count(*) as n from messages where channel_id = ${publicId}`)).toBe(2)
    await service.completeImportJob(workspaceId, second.jobId, { status: 'completed', error: null, report: emptyReport })
  })

  test('取り込み済みのメッセージに後のエクスポートで画像の参照が増えると、公開し直したときに添付を補う', async () => {
    const conversation = '19:FixtureMoreMediaCommunityEEEEEEEEEEEEEEEEEEE1@thread.v2'
    const targetId = randomUUID()
    await db.db.insert(db.channels).values({ id: targetId, workspaceId, type: 'workspace', name: '画像が増える', isPrivate: false })
    const withMedia = messages.filter(m => toBatchMessage(m, null).mediaObjectIds.length > 0)
    expect(withMedia.length).toBeGreaterThan(0)
    const first = await createJob({ conversation, channel: targetId })
    // 最初のエクスポートでは画像の参照が無かった
    await service.stageMessageBatch(workspaceId, adminId, first.jobId, {
      conversationExternalId: conversation,
      messages: messages.map(m => ({ ...toBatchMessage(m, null), mediaObjectIds: [] })),
    })
    expect(await publishAll(first.jobId, conversation)).toMatchObject({ attachments: 0, missingMedia: 0 })
    await service.completeImportJob(workspaceId, first.jobId, { status: 'completed', error: null, report: emptyReport })

    const fileId = randomUUID()
    await db.db.insert(db.files).values({ id: fileId, workspaceId, uploadedBy: adminId, storagePath: `${workspaceId}/${targetId}/${adminId}/more.jpg`, fileName: 'more.jpg', mimeType: 'image/jpeg', fileSize: 10, fileType: 'image' })
    const second = await createJob({ conversation, channel: targetId })
    expect(await service.stageMessageBatch(workspaceId, adminId, second.jobId, stageBody(conversation))).toMatchObject({ staged: 0 })
    await service.registerImportedMedia(workspaceId, adminId, second.jobId, { objectId: MEDIA_ID, fileId, channelId: targetId })
    expect(await publishAll(second.jobId, conversation)).toMatchObject({ published: 0, attachments: withMedia.length })
    await service.completeImportJob(workspaceId, second.jobId, { status: 'completed', error: null, report: emptyReport })
  })

  test('画像がそろわずに公開したメッセージも、画像がそろってから公開し直すと添付を補う', async () => {
    const repairConversation = '19:FixtureRepairCommunityCCCCCCCCCCCCCCCCCCCCC1@thread.v2'
    const repairChannelId = randomUUID()
    await db.db.insert(db.channels).values({ id: repairChannelId, workspaceId, type: 'workspace', name: '補う', isPrivate: false })
    const repairFileId = randomUUID()
    await db.db.insert(db.files).values({ id: repairFileId, workspaceId, uploadedBy: adminId, storagePath: `${workspaceId}/${repairChannelId}/${adminId}/repair.jpg`, fileName: 'repair.jpg', mimeType: 'image/jpeg', fileSize: 10, fileType: 'image' })
    const { jobId } = await createJob({ conversation: repairConversation, channel: repairChannelId })
    await service.stageMessageBatch(workspaceId, adminId, jobId, stageBody(repairConversation))
    expect(await publishAll(jobId, repairConversation)).toMatchObject({ attachments: 0, missingMedia: 2 })
    await service.registerImportedMedia(workspaceId, adminId, jobId, { objectId: MEDIA_ID, fileId: repairFileId, channelId: repairChannelId })
    expect(await publishAll(jobId, repairConversation)).toMatchObject({ published: 0, attachments: 2 })
    expect(await publishAll(jobId, repairConversation)).toMatchObject({ attachments: 0 })
    await service.completeImportJob(workspaceId, jobId, { status: 'completed', error: null, report: emptyReport })
  })

  test('既存の公開チャンネルに取り込んでも、開いたことのない人の Cairn での未読は既読にしない', async () => {
    const liveChannelId = randomUUID()
    await db.db.insert(db.channels).values({ id: liveChannelId, workspaceId, type: 'workspace', name: '既存', isPrivate: false })
    const liveAt = new Date('2026-11-01T00:00:00.000Z')
    await db.db.insert(db.messages).values({ channelId: liveChannelId, senderId: adminId, content: 'Cairn での投稿', createdAt: liveAt, updatedAt: liveAt })
    const liveConversation = '19:FixtureLiveCommunityDDDDDDDDDDDDDDDDDDDDDDD1@thread.v2'
    const { jobId } = await createJob({ conversation: liveConversation, channel: liveChannelId })
    await service.stageMessageBatch(workspaceId, adminId, jobId, stageBody(liveConversation))
    await publishAll(jobId, liveConversation)
    await service.completeImportJob(workspaceId, jobId, { status: 'completed', error: null, report: emptyReport })
    const row = (await db.db.execute(sql`select last_read_at from channel_read_states where channel_id = ${liveChannelId} and user_id = ${memberId}`)).rows[0] as { last_read_at: string }
    expect(new Date(row.last_read_at).getTime()).toBe(liveAt.getTime() - 1)
    // AI の巡回位置は置かない（巡回は messages.imported で過去ログを除外する）
    expect(await count(sql`select count(*) as n from ai_scan_states where channel_id = ${liveChannelId}`)).toBe(0)
  })

  test('他のワークスペースからは、取り込んだ投稿者が見えない', async () => {
    expect(await service.listImportIdentities(otherWorkspaceId, 'teams-consumer')).toEqual([])
  })

  test('後のエクスポートで名前が分かると、作成済みの取り込み用プロフィールの表示名も変わる', async () => {
    const key = 'mri:8:live:.cid.0000000unknown1'
    const before = (await db.db.execute(sql`select p.display_name from import_identities i join profiles p on p.id = i.profile_id where i.workspace_id = ${workspaceId} and i.external_key = ${key}`)).rows[0] as { display_name: string }
    expect(before.display_name).toBe('名前不明の参加者')
    await service.createImportJob(workspaceId, adminId, {
      source: 'teams-consumer',
      exportedAt: bundle.exportedAt,
      conversations: [{ externalId: COMMUNITY, channelId, totalMessages: messages.length, unknownPolicy: 'include_unknown' }],
      identities: identities.map(identity => identity.key === key ? { ...identity, displayName: 'Jiro Suzuki' } : identity),
      links: [],
    })
    const after = (await db.db.execute(sql`select p.display_name from import_identities i join profiles p on p.id = i.profile_id where i.workspace_id = ${workspaceId} and i.external_key = ${key}`)).rows[0] as { display_name: string }
    expect(after.display_name).toBe('Jiro Suzuki')
  })
})
