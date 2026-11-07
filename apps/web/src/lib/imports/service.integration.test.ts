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
    // 取り込みメッセージの送信者は共通プロフィールなので、ワークスペースを消せばメッセージも消える
    await db.db.delete(workspaces).where(inArray(workspaces.id, [workspaceId, otherWorkspaceId]))
    await db.db.delete(profiles).where(inArray(profiles.id, [adminId, memberId]))
  })

  async function count(query: ReturnType<typeof sql>) {
    const result = await db.db.execute(query)
    return Number((result.rows[0] as { n: string | number }).n)
  }

  async function createJob(links: Array<{ key: string; userId: string }> = []) {
    return service.createImportJob(workspaceId, adminId, {
      source: 'teams-consumer',
      exportedAt: bundle.exportedAt,
      conversations: [{ externalId: COMMUNITY, channelId, totalMessages: messages.length }],
      identities,
      links,
    })
  }

  const batch = (subset = messages) => ({
    conversationExternalId: COMMUNITY,
    messages: subset.map(m => toBatchMessage(m, new Set([MEDIA_ID]))),
  })

  test('参加していない非公開チャンネル・他のワークスペースのチャンネルには取り込めない', async () => {
    await expect(service.createImportJob(workspaceId, memberId, {
      source: 'teams-consumer', exportedAt: null, conversations: [{ externalId: COMMUNITY, channelId, totalMessages: 1 }], identities, links: [],
    })).rejects.toMatchObject({ status: 403 })
    await expect(service.createImportJob(workspaceId, adminId, {
      source: 'teams-consumer', exportedAt: null, conversations: [{ externalId: COMMUNITY, channelId: otherChannelId, totalMessages: 1 }], identities, links: [],
    })).rejects.toMatchObject({ status: 400 })
  })

  test('投稿者不明は Cairn のユーザーに紐づけられない', async () => {
    await expect(createJob([{ key: 'anonymous', userId: memberId }])).rejects.toMatchObject({ status: 400 })
  })

  test('一部のメッセージだけ取り込んだあと、全件を再実行すると残りだけが入る（中断後の再開）', async () => {
    const { jobId } = await createJob([{ key: 'name:Hanako Sato', userId: memberId }])
    await service.registerImportedMedia(workspaceId, adminId, jobId, { objectId: MEDIA_ID, fileId, channelId })

    const first = await service.importMessageBatch(workspaceId, adminId, jobId, batch(messages.slice(0, 2)))
    expect(first).toMatchObject({ imported: 2, duplicates: 0 })
    // ここで中断したとみなし、ジョブを失敗で終える
    await service.completeImportJob(workspaceId, jobId, { status: 'failed', error: '中断', report: { conversations: [], excludedConversations: {}, mediaFailures: [] } })
    await expect(service.importMessageBatch(workspaceId, adminId, jobId, batch())).rejects.toMatchObject({ status: 409 })

    const { jobId: retryJob } = await createJob()
    const found = await service.lookupImportedMedia(workspaceId, retryJob, channelId, [MEDIA_ID])
    expect(found).toEqual({ [MEDIA_ID]: fileId })
    const second = await service.importMessageBatch(workspaceId, adminId, retryJob, batch())
    expect(second).toMatchObject({ imported: messages.length - 2, duplicates: 2 })
    await service.completeImportJob(workspaceId, retryJob, { status: 'completed', error: null, report: { conversations: [], excludedConversations: {}, mediaFailures: [] } })

    expect(await count(sql`select count(*) as n from messages where channel_id = ${channelId}`)).toBe(messages.length)
  })

  test('同じデータをもう一度取り込んでも二重登録されない', async () => {
    const { jobId } = await createJob()
    const again = await service.importMessageBatch(workspaceId, adminId, jobId, batch())
    expect(again).toMatchObject({ imported: 0, duplicates: messages.length })
    expect(await count(sql`select count(*) as n from messages where channel_id = ${channelId}`)).toBe(messages.length)
    expect(await count(sql`select count(*) as n from imported_messages where workspace_id = ${workspaceId}`)).toBe(messages.length)
  })

  test('元の投稿日時・本文・編集日時を保持し、送信者は取り込みプロフィールにする', async () => {
    const original = messages.find(m => m.externalId === '1760000500000')!
    const rows = await db.db.execute(sql`
      select m.content, m.created_at, m.updated_at, m.sender_id, i.kind, i.display_name, im.external_message_id
      from messages m join imported_messages im on im.message_id = m.id join import_identities i on i.id = im.identity_id
      where im.workspace_id = ${workspaceId} and im.external_message_id = ${original.externalId}`)
    const row = rows.rows[0] as Record<string, unknown>
    expect(row['content']).toBe(original.text)
    expect(new Date(row['created_at'] as string).toISOString()).toBe(original.sentAt)
    expect(new Date(row['updated_at'] as string).toISOString()).toBe(original.editedAt)
    expect(row['sender_id']).toBe(db.IMPORT_SENDER_PROFILE_ID)
  })

  test('投稿者不明の投稿は匿名の identity に入り、元の属性を残す', async () => {
    const rows = await db.db.execute(sql`
      select i.is_anonymous, i.linked_user_id, im.attributes
      from imported_messages im join import_identities i on i.id = im.identity_id
      where im.workspace_id = ${workspaceId} and im.external_message_id = '1760000700000'`)
    const row = rows.rows[0] as { is_anonymous: boolean; linked_user_id: string | null; attributes: Record<string, unknown> }
    expect(row.is_anonymous).toBe(true)
    expect(row.linked_user_id).toBeNull()
    expect(row.attributes).toMatchObject({ senderIdPresent: false, senderNamePresent: false })
  })

  test('管理者が確認した紐づけだけが入り、表示ではその人の名前になる', async () => {
    const { loadImportedSenders } = await import('./display')
    const hanakoMessage = (await db.db.execute(sql`select message_id from imported_messages where workspace_id = ${workspaceId} and external_message_id = '1760000800000'`)).rows[0] as { message_id: string }
    const anonymousMessage = (await db.db.execute(sql`select message_id from imported_messages where workspace_id = ${workspaceId} and external_message_id = '1760000700000'`)).rows[0] as { message_id: string }
    const senders = await loadImportedSenders(workspaceId, [hanakoMessage.message_id, anonymousMessage.message_id])
    expect(senders.get(hanakoMessage.message_id)).toMatchObject({ name: 'Hanako Sato', info: { linkedUserId: memberId, anonymous: false } })
    expect(senders.get(anonymousMessage.message_id)).toMatchObject({ name: '投稿者不明', info: { anonymous: true, linkedUserId: null } })
    // 表示名が同じ「山田 太郎」は誰にも紐づけていないので、紐づけは増えていない
    expect(await count(sql`select count(*) as n from import_identities where workspace_id = ${workspaceId} and linked_user_id is not null`)).toBe(1)
  })

  test('同じ画像を参照する複数のメッセージは、1つのファイルを共有して添付する', async () => {
    expect(await count(sql`select count(*) as n from imported_files where workspace_id = ${workspaceId}`)).toBe(1)
    expect(await count(sql`select count(*) as n from message_attachments where file_id = ${fileId}`)).toBe(2)
  })

  test('非公開チャンネルに取り込んだ画像を、別のチャンネルへの取り込みで使い回さない', async () => {
    const otherConversation = '19:FixtureOtherCommunityBBBBBBBBBBBBBBBBBBBBBB1@thread.v2'
    const { jobId } = await service.createImportJob(workspaceId, adminId, {
      source: 'teams-consumer', exportedAt: null, identities, links: [],
      conversations: [{ externalId: otherConversation, channelId: publicChannelId, totalMessages: messages.length }],
    })
    expect(await service.lookupImportedMedia(workspaceId, jobId, publicChannelId, [MEDIA_ID])).toEqual({})
    // 取り込み先でないチャンネルのメディアは問い合わせられない
    await expect(service.lookupImportedMedia(workspaceId, jobId, channelId, [MEDIA_ID])).rejects.toMatchObject({ status: 400 })
    const result = await service.importMessageBatch(workspaceId, adminId, jobId, { conversationExternalId: otherConversation, messages: messages.map(m => toBatchMessage(m, new Set([MEDIA_ID]))) })
    expect(result).toMatchObject({ imported: messages.length, attachments: 0, missingMedia: 2 })
    expect(await count(sql`select count(*) as n from message_attachments a join messages m on m.id = a.message_id where m.channel_id = ${publicChannelId}`)).toBe(0)
    await service.completeImportJob(workspaceId, jobId, { status: 'completed', error: null, report: { conversations: [], excludedConversations: {}, mediaFailures: [] } })
  })

  test('画像がそろわずに取り込んだメッセージも、再実行で画像がそろえば添付を補う', async () => {
    const repairConversation = '19:FixtureRepairCommunityCCCCCCCCCCCCCCCCCCCCC1@thread.v2'
    const repairChannelId = randomUUID()
    await db.db.insert(db.channels).values({ id: repairChannelId, workspaceId, type: 'workspace', name: '補う', isPrivate: false })
    const repairFileId = randomUUID()
    await db.db.insert(db.files).values({ id: repairFileId, workspaceId, uploadedBy: adminId, storagePath: `${workspaceId}/${repairChannelId}/${adminId}/repair.jpg`, fileName: 'repair.jpg', mimeType: 'image/jpeg', fileSize: 10, fileType: 'image' })
    const create = () => service.createImportJob(workspaceId, adminId, {
      source: 'teams-consumer', exportedAt: null, identities, links: [],
      conversations: [{ externalId: repairConversation, channelId: repairChannelId, totalMessages: messages.length }],
    })
    const body = { conversationExternalId: repairConversation, messages: messages.map(m => toBatchMessage(m, new Set([MEDIA_ID]))) }
    const first = await create()
    expect(await service.importMessageBatch(workspaceId, adminId, first.jobId, body)).toMatchObject({ imported: messages.length, attachments: 0, missingMedia: 2 })
    await service.completeImportJob(workspaceId, first.jobId, { status: 'completed', error: null, report: { conversations: [], excludedConversations: {}, mediaFailures: [] } })

    const second = await create()
    await service.registerImportedMedia(workspaceId, adminId, second.jobId, { objectId: MEDIA_ID, fileId: repairFileId, channelId: repairChannelId })
    expect(await service.importMessageBatch(workspaceId, adminId, second.jobId, body)).toMatchObject({ imported: 0, duplicates: messages.length, attachments: 2 })
    // もう一度流しても二重に添付しない
    expect(await service.importMessageBatch(workspaceId, adminId, second.jobId, body)).toMatchObject({ attachments: 0 })
    expect(await count(sql`select count(*) as n from message_attachments where file_id = ${repairFileId}`)).toBe(2)
    await service.completeImportJob(workspaceId, second.jobId, { status: 'completed', error: null, report: { conversations: [], excludedConversations: {}, mediaFailures: [] } })
  })

  test('既存の公開チャンネルに取り込んでも、開いたことのない人の Cairn での未読は既読にしない', async () => {
    const liveChannelId = randomUUID()
    await db.db.insert(db.channels).values({ id: liveChannelId, workspaceId, type: 'workspace', name: '既存', isPrivate: false })
    const liveAt = new Date('2026-11-01T00:00:00.000Z')
    await db.db.insert(db.messages).values({ channelId: liveChannelId, senderId: adminId, content: 'Cairn での投稿', createdAt: liveAt, updatedAt: liveAt })
    const liveConversation = '19:FixtureLiveCommunityDDDDDDDDDDDDDDDDDDDDDDD1@thread.v2'
    const { jobId } = await service.createImportJob(workspaceId, adminId, {
      source: 'teams-consumer', exportedAt: null, identities, links: [],
      conversations: [{ externalId: liveConversation, channelId: liveChannelId, totalMessages: messages.length }],
    })
    await service.importMessageBatch(workspaceId, adminId, jobId, { conversationExternalId: liveConversation, messages: messages.map(m => toBatchMessage(m, new Set())) })
    await service.completeImportJob(workspaceId, jobId, { status: 'completed', error: null, report: { conversations: [], excludedConversations: {}, mediaFailures: [] } })
    const row = (await db.db.execute(sql`select last_read_at from channel_read_states where channel_id = ${liveChannelId} and user_id = ${memberId}`)).rows[0] as { last_read_at: string }
    // 取り込んだ過去ログ（2025年）は既読、Cairn での投稿（2026-11-01）は未読のまま
    expect(new Date(row.last_read_at).getTime()).toBe(liveAt.getTime() - 1)
  })

  test('リアクションを取り込み元の人ごとに保存する', async () => {
    const reactionTotal = messages.reduce((n, m) => n + m.reactions.length, 0)
    expect(await count(sql`select count(*) as n from imported_message_reactions r join messages m on m.id = r.message_id where m.channel_id = ${channelId}`)).toBe(reactionTotal)
  })

  test('過去ログの取り込みで通知・Inngest のイベントを出さない', async () => {
    expect(mockInngestSend).not.toHaveBeenCalled()
    expect(await count(sql`select count(*) as n from notifications where workspace_id = ${workspaceId}`)).toBe(0)
  })

  test('完了時に取り込み先の既読位置を置き、AI の巡回位置は進めない（巡回は取り込みの投稿を除外する）', async () => {
    expect(await count(sql`select count(*) as n from channel_read_states where channel_id = ${channelId} and user_id = ${adminId}`)).toBe(1)
    expect(await count(sql`select count(*) as n from ai_scan_states where channel_id = ${channelId}`)).toBe(0)
  })

  test('他のワークスペースからは、取り込んだ投稿者もメッセージも見えない', async () => {
    const otherIdentities = await service.listImportIdentities(otherWorkspaceId, 'teams-consumer')
    expect(otherIdentities).toEqual([])
    const { loadImportedSenders } = await import('./display')
    const anyMessage = (await db.db.execute(sql`select message_id from imported_messages where workspace_id = ${workspaceId} limit 1`)).rows[0] as { message_id: string }
    expect((await loadImportedSenders(otherWorkspaceId, [anyMessage.message_id])).size).toBe(0)
  })

  test('紐づけを外すと取り込み元の名前に戻り、投稿者不明には紐づけられない', async () => {
    const list = await service.listImportIdentities(workspaceId, 'teams-consumer')
    const hanako = list.find(i => i.key === 'name:Hanako Sato')!
    const anonymous = list.find(i => i.isAnonymous)!
    await service.linkImportIdentity(workspaceId, adminId, hanako.id, null)
    await expect(service.linkImportIdentity(workspaceId, adminId, anonymous.id, memberId)).rejects.toMatchObject({ status: 400 })
    expect((await service.listImportIdentities(workspaceId, 'teams-consumer')).find(i => i.id === hanako.id)?.linkedUserId).toBeNull()
  })
})
