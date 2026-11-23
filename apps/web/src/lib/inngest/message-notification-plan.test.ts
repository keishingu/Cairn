// Copyright 2026 Cairn Contributors
// SPDX-License-Identifier: Apache-2.0

import { describe, expect, test, vi } from 'vitest'
import type { MessageCreatedEvent } from './events'
import { planMessageNotifications, type PlanReaders, type Recipient } from './message-notification-plan'

const data: MessageCreatedEvent['data'] = {
  messageId: 'message-id',
  channelId: 'channel-id',
  workspaceId: 'workspace-id',
  senderId: 'sender-id',
  senderName: '送信者',
  content: '本文',
  attachmentFileIds: [],
}

const USER = '11111111-1111-4111-8111-111111111111'

function fakeReaders(overrides: Partial<PlanReaders> = {}) {
  const readers: PlanReaders = {
    readMessageChannel: vi.fn(async () => 'channel-id'),
    fetchChannelMembers: vi.fn(async () => []),
    filterUnblocked: vi.fn(async (_senderId: string, recipients: Recipient[]) => recipients),
    readChannelType: vi.fn(async () => 'project'),
    fetchReplyTargets: vi.fn(async () => []),
    fetchMentionedMembers: vi.fn(async () => []),
    expandAllMention: vi.fn(async () => []),
    expandProjectMembersMention: vi.fn(async () => []),
    expandAttributeMentions: vi.fn(async () => []),
    expandRoleMentions: vi.fn(async () => []),
    buildMentionNameMap: vi.fn(async () => new Map<string, string>()),
    filterMentionAccess: vi.fn(async (_w: string, _c: string, recipients: Recipient[]) => recipients),
    resolveRecipientLocales: vi.fn(async (ids: string[]) => Object.fromEntries(ids.map((id) => [id, 'ja' as const]))),
    ...overrides,
  }
  return readers
}

describe('planMessageNotifications', () => {
  test('スレッドへ移動済みなら、今のチャンネルでメンバーと種別を引く', async () => {
    const readers = fakeReaders({ readMessageChannel: vi.fn(async () => 'thread-id') })
    const plan = await planMessageNotifications(data, readers)
    expect(plan.channelId).toBe('thread-id')
    expect(readers.fetchChannelMembers).toHaveBeenCalledWith('workspace-id', 'thread-id', 'sender-id')
    expect(readers.readChannelType).toHaveBeenCalledWith('thread-id')
  })

  test('DM は相手の名前で本文を作り、メンションや返信の宛先を引かない', async () => {
    const member = { userId: USER, displayName: '相手' }
    const readers = fakeReaders({ fetchChannelMembers: vi.fn(async () => [member]), readChannelType: vi.fn(async () => 'dm') })
    const plan = await planMessageNotifications({ ...data, content: `<@${USER}> こんにちは` }, readers)
    expect(plan).toEqual({ kind: 'dm', channelId: 'channel-id', members: [member], body: '@相手 こんにちは' })
    expect(readers.fetchReplyTargets).not.toHaveBeenCalled()
    expect(readers.fetchMentionedMembers).not.toHaveBeenCalled()
  })

  test('ブロック関係のあるメンバーは添付通知の宛先から外す', async () => {
    const kept = { userId: 'kept', displayName: '残る' }
    const readers = fakeReaders({
      fetchChannelMembers: vi.fn(async () => [kept, { userId: 'blocked', displayName: '外れる' }]),
      filterUnblocked: vi.fn(async (_s: string, recipients: Recipient[]) => recipients.filter((r) => r.userId !== 'blocked')),
    })
    const plan = await planMessageNotifications(data, readers)
    expect(plan.members).toEqual([kept])
  })

  test('メンションも返信もない投稿では、名前解決や言語の解決に進まない', async () => {
    const readers = fakeReaders()
    const plan = await planMessageNotifications(data, readers)
    expect(plan).toMatchObject({ kind: 'channel', mentionRecipients: [] })
    expect(readers.filterMentionAccess).not.toHaveBeenCalled()
    expect(readers.buildMentionNameMap).not.toHaveBeenCalled()
    expect(readers.resolveRecipientLocales).not.toHaveBeenCalled()
  })

  test('@all と @project_members と属性メンションを展開し、ユーザーメンションとして引かない', async () => {
    const readers = fakeReaders({
      expandAllMention: vi.fn(async () => [{ userId: 'u-all', displayName: '全員候補' }]),
      expandProjectMembersMention: vi.fn(async () => [{ userId: 'u-proj', displayName: 'PJ候補' }]),
      expandAttributeMentions: vi.fn(async () => [{ userId: 'u-attr', displayName: '属性候補' }]),
    })
    const plan = await planMessageNotifications({ ...data, content: '<@all> <@project_members> <@attr:attr-1> 確認' }, readers)
    expect(readers.expandProjectMembersMention).toHaveBeenCalledWith('workspace-id', 'channel-id', 'sender-id')
    expect(readers.expandAttributeMentions).toHaveBeenCalledWith('workspace-id', ['attr-1'], 'sender-id')
    expect(readers.fetchMentionedMembers).not.toHaveBeenCalled()
    expect(plan).toMatchObject({ explicitlyMentionedIds: ['u-all', 'u-proj', 'u-attr'] })
  })

  test('プロジェクトの役割メンションを展開し、ユーザーメンションとして扱わない', async () => {
    const readers = fakeReaders({ expandRoleMentions: vi.fn(async () => [{ userId: 'u-reviewer', displayName: 'レビュワー候補' }]) })
    await planMessageNotifications({ ...data, content: '<@role:role-1> 確認お願いします' }, readers)
    expect(readers.expandRoleMentions).toHaveBeenCalledWith('workspace-id', 'channel-id', ['role-1'], 'sender-id')
    expect(readers.fetchMentionedMembers).not.toHaveBeenCalled()
  })

  test('メンションがなくても返信元を宛先にし、メンションとは区別する', async () => {
    const author = { userId: 'author', displayName: '返信元' }
    const readers = fakeReaders({ fetchReplyTargets: vi.fn(async () => [author]) })
    const plan = await planMessageNotifications({ ...data, content: '了解です' }, readers)
    expect(plan).toMatchObject({
      kind: 'channel',
      mentionRecipients: [author],
      explicitlyMentionedIds: [],
      mentionBody: '了解です',
      recipientLocales: { author: 'ja' },
    })
  })

  test('アクセスやブロックで外れた宛先には通知しない', async () => {
    const readers = fakeReaders({
      fetchReplyTargets: vi.fn(async () => [{ userId: 'author', displayName: '返信元' }]),
      filterMentionAccess: vi.fn(async () => []),
    })
    const plan = await planMessageNotifications(data, readers)
    expect(plan).toMatchObject({ mentionRecipients: [] })
    expect(readers.resolveRecipientLocales).not.toHaveBeenCalled()
  })

  test('本文プレビューのメンションは送信時点の最新名で解決する', async () => {
    const mentioned = { userId: USER, displayName: '旧い名前' }
    const readers = fakeReaders({
      fetchMentionedMembers: vi.fn(async () => [mentioned]),
      buildMentionNameMap: vi.fn(async () => new Map([[USER, '新しい名前']])),
    })
    const plan = await planMessageNotifications({ ...data, content: `<@${USER}> 確認` }, readers)
    expect(plan).toMatchObject({ mentionRecipients: [mentioned], explicitlyMentionedIds: [USER], mentionBody: '@新しい名前 確認' })
  })
})
