// Copyright 2026 Cairn Contributors
// SPDX-License-Identifier: Apache-2.0

import { describe, expect, it, vi } from 'vitest'
import type { MessageCreatedEvent } from './events'

type CapturedHandler = (args: {
  event: { data: MessageCreatedEvent['data'] }
  step: {
    run: (name: string, callback: () => unknown) => Promise<unknown>
    sleep: (name: string, duration: string) => Promise<void>
  }
}) => Promise<unknown>

const { handlers } = vi.hoisted(() => ({
  handlers: new Map<string, CapturedHandler>(),
}))

vi.mock('./client', () => ({
  inngest: {
    createFunction: (options: { id: string }, _trigger: unknown, handler: CapturedHandler) => {
      handlers.set(options.id, handler)
      return { options }
    },
    send: vi.fn(),
  },
}))

vi.mock('@/lib/push/send', () => ({ sendPushToUser: vi.fn() }))
vi.mock('@/lib/tasks/assignment-delivery', () => ({ canDeliverTaskAssignment: vi.fn() }))
vi.mock('@/lib/access/membership', () => ({ getWorkspaceRole: vi.fn().mockResolvedValue('member') }))
vi.mock('@/lib/permissions', () => ({ canAccessChannel: vi.fn().mockResolvedValue(true) }))
vi.mock('@/lib/uploads/cleanup', () => ({ cleanupExpiredUploadRequests: vi.fn() }))
vi.mock('@/lib/ai/attachments', () => ({ cleanupUnsentAiAttachments: vi.fn() }))
vi.mock('@/first-party-apps/polls', () => ({ sweepStalePolls: vi.fn() }))
vi.mock('./message-notification-plan', () => ({
  planMessageNotifications: vi.fn(),
  readMessageChannel: vi.fn().mockResolvedValue('channel-id'),
  classifyPushRecipients: vi.fn(),
}))

import './functions'
import { sendPushToUser } from '@/lib/push/send'
import { getWorkspaceRole } from '@/lib/access/membership'
import { canAccessChannel } from '@/lib/permissions'
import { canDeliverTaskAssignment } from '@/lib/tasks/assignment-delivery'
import { cleanupExpiredUploadRequests } from '@/lib/uploads/cleanup'
import { cleanupUnsentAiAttachments } from '@/lib/ai/attachments'
import { sweepStalePolls } from '@/first-party-apps/polls'
import { classifyPushRecipients, readMessageChannel, type MessageNotificationPlan } from './message-notification-plan'
import type { AppLocale } from '@cairn/shared'

function stepNames(run: ReturnType<typeof vi.fn>) {
  return run.mock.calls.map(([name]) => name as string)
}

describe('onMessageCreated', () => {
  const baseData: MessageCreatedEvent['data'] = {
    messageId: 'message-id',
    channelId: 'channel-id',
    workspaceId: 'workspace-id',
    senderId: 'sender-id',
    senderName: '送信者',
    content: '本文',
    attachmentFileIds: [],
  }
  const channelPlan = (overrides: Partial<Extract<MessageNotificationPlan, { kind: 'channel' }>> = {}): MessageNotificationPlan => ({
    kind: 'channel',
    channelId: 'channel-id',
    members: [],
    mentionRecipients: [],
    explicitlyMentionedIds: [],
    mentionBody: '',
    recipientLocales: {},
    ...overrides,
  })

  // 宛先の決定は plan に任せ、書き込みの step は呼ばれたことだけを見る。Push の step は中身を実行する
  function runWith(plan: MessageNotificationPlan, data: Partial<MessageCreatedEvent['data']> = {}) {
    vi.mocked(sendPushToUser).mockClear()
    const run = vi.fn(async (name: string, callback: () => unknown) => {
      switch (name) {
        case 'plan-notifications': return plan
        case 'send-dm-push':
        case 'send-mention-push': return callback()
        case 'create-dm-notifications':
        case 'create-mention-notifications':
        case 'create-file-notifications': return undefined
        default: throw new Error(`Unexpected step: ${name}`)
      }
    })
    const sleep = vi.fn()
    const result = handlers.get('on-message-created')!({ event: { data: { ...baseData, ...data } }, step: { run, sleep } })
    return { run, sleep, result }
  }

  it('通知する相手がいない投稿は、宛先を決める1 step だけで終える', async () => {
    const { run, sleep, result } = runWith(channelPlan())
    await expect(result).resolves.toEqual({ mentionNotifications: 0, fileNotifications: 0 })
    expect(stepNames(run)).toEqual(['plan-notifications'])
    expect(sleep).not.toHaveBeenCalled()
  })

  it('添付があっても通知対象メンバーが0人なら添付通知を作らない', async () => {
    const { run, result } = runWith(channelPlan(), { attachmentFileIds: ['file-id'] })
    await expect(result).resolves.toEqual({ mentionNotifications: 0, fileNotifications: 0 })
    expect(stepNames(run)).not.toContain('create-file-notifications')
  })

  it('添付はチャンネルメンバーへ通知する', async () => {
    const member = { userId: 'member', displayName: 'メンバー' }
    const { run, result } = runWith(channelPlan({ members: [member] }), { attachmentFileIds: ['file-id'] })
    await expect(result).resolves.toEqual({ mentionNotifications: 0, fileNotifications: 1 })
    expect(stepNames(run)).toEqual(['plan-notifications', 'create-file-notifications'])
  })

  it('猶予中にスレッドへ移動されても、メンションPushは送る直前のチャンネルとメッセージIDで開かせる', async () => {
    const mentioned = { userId: 'mentioned-user', displayName: 'メンバー' }
    vi.mocked(readMessageChannel).mockResolvedValueOnce('thread-id')
    vi.mocked(classifyPushRecipients).mockResolvedValueOnce({ readRecipients: [], unreadRecipients: [mentioned] })
    const { run, result } = runWith(channelPlan({
      channelId: 'parent-channel-id',
      mentionRecipients: [mentioned],
      explicitlyMentionedIds: ['mentioned-user'],
      recipientLocales: { 'mentioned-user': 'ja' },
    }), { channelId: 'parent-channel-id' })

    await expect(result).resolves.toEqual({ mentionNotifications: 1, fileNotifications: 0 })
    expect(stepNames(run)).toEqual(['plan-notifications', 'create-mention-notifications', 'send-mention-push'])
    expect(classifyPushRecipients).toHaveBeenLastCalledWith('message-id', 'thread-id', [mentioned])
    expect(sendPushToUser).toHaveBeenCalledWith(
      'mentioned-user',
      expect.objectContaining({ url: '/chats/thread-id?m=message-id', title: '送信者 があなたをメンションしました' }),
      { updateAppBadge: true },
    )
  })

  it('現在も権限のあるDM受信者へPushを送る', async () => {
    const member = { userId: 'recipient', displayName: '受信者' }
    vi.mocked(classifyPushRecipients).mockResolvedValueOnce({ readRecipients: [], unreadRecipients: [member] })
    const { run, result } = runWith({ kind: 'dm', channelId: 'channel-id', members: [member], body: '本文' })
    await expect(result).resolves.toEqual({ mentionNotifications: 0, fileNotifications: 0, dm: true })
    expect(stepNames(run)).toEqual(['plan-notifications', 'create-dm-notifications', 'send-dm-push'])
    expect(sendPushToUser).toHaveBeenCalledWith('recipient', expect.objectContaining({ body: '本文' }))
  })

  it('相手のいないDMは通知もPushも作らない', async () => {
    const { run, sleep, result } = runWith({ kind: 'dm', channelId: 'channel-id', members: [], body: '本文' })
    await expect(result).resolves.toEqual({ mentionNotifications: 0, fileNotifications: 0, dm: true })
    expect(stepNames(run)).toEqual(['plan-notifications'])
    expect(sleep).not.toHaveBeenCalled()
  })

  it.each([
    ['非活性化', null, true],
    ['チャンネル権限の削除', 'member', false],
  ] as const)('猶予中に%sされた受信者へメンション本文をPushしない', async (_change, role, accessible) => {
    vi.mocked(getWorkspaceRole).mockResolvedValue(role)
    vi.mocked(canAccessChannel).mockResolvedValue(accessible)
    const recipient = { userId: 'mentioned-user', displayName: 'メンバー' }
    vi.mocked(classifyPushRecipients).mockResolvedValueOnce({ readRecipients: [], unreadRecipients: [recipient] })
    const { result } = runWith(channelPlan({
      mentionRecipients: [recipient],
      explicitlyMentionedIds: ['mentioned-user'],
      recipientLocales: { 'mentioned-user': 'ja' },
    }))
    await result
    expect(sendPushToUser).not.toHaveBeenCalled()
    vi.mocked(getWorkspaceRole).mockResolvedValue('member')
    vi.mocked(canAccessChannel).mockResolvedValue(true)
  })

  describe('返信の通知', () => {
    function runReply(author: { userId: string; displayName: string }, options: { mentioned?: boolean; locale?: AppLocale } = {}) {
      vi.mocked(classifyPushRecipients).mockResolvedValueOnce({ readRecipients: [], unreadRecipients: [author] })
      return runWith(channelPlan({
        mentionRecipients: [author],
        explicitlyMentionedIds: options.mentioned ? [author.userId] : [],
        recipientLocales: { [author.userId]: options.locale ?? 'ja' },
      }))
    }

    it('メンションされていない返信元には返信の文言で通知する', async () => {
      const author = { userId: 'author', displayName: '返信元' }
      const { result } = runReply(author)
      await expect(result).resolves.toEqual({ mentionNotifications: 1, fileNotifications: 0 })
      expect(sendPushToUser).toHaveBeenCalledWith(
        'author',
        expect.objectContaining({ title: '送信者 があなたのメッセージに返信しました' }),
        { updateAppBadge: true },
      )
    })

    it('返信元がメンションもされているときはメンションの文言で1件だけ通知する', async () => {
      const author = { userId: 'author', displayName: '返信元' }
      const { result } = runReply(author, { mentioned: true })
      await expect(result).resolves.toEqual({ mentionNotifications: 1, fileNotifications: 0 })
      expect(sendPushToUser).toHaveBeenCalledTimes(1)
      expect(sendPushToUser).toHaveBeenCalledWith(
        'author',
        expect.objectContaining({ title: '送信者 があなたをメンションしました' }),
        { updateAppBadge: true },
      )
    })

    it('返信の通知タイトルを受信者の表示言語で送る', async () => {
      const author = { userId: 'author', displayName: '返信元' }
      const { result } = runReply(author, { locale: 'en' })
      await result
      expect(sendPushToUser).toHaveBeenCalledWith(
        'author',
        expect.objectContaining({ title: '送信者 replied to your message' }),
        { updateAppBadge: true },
      )
    })
  })
})

describe('runHourlyMaintenance', () => {
  function runMaintenance() {
    const handler = handlers.get('run-hourly-maintenance')
    expect(handler).toBeDefined()
    return handler!({ event: { data: {} as MessageCreatedEvent['data'] }, step: { run: vi.fn(), sleep: vi.fn() } })
  }

  it('毎時の後片付けと投票の拾い直しを1回の実行でまとめて行う', async () => {
    vi.mocked(cleanupExpiredUploadRequests).mockResolvedValue({ removed: 1, failed: 0 })
    vi.mocked(cleanupUnsentAiAttachments).mockResolvedValue({ removed: 2, failed: 0 })
    vi.mocked(sweepStalePolls).mockResolvedValue({ closed: 0, requeued: 3 })

    await expect(runMaintenance()).resolves.toEqual({
      expiredUploadRequests: { removed: 1, failed: 0 },
      unsentAiAttachments: { removed: 2, failed: 0 },
      stalePolls: { closed: 0, requeued: 3 },
    })
  })

  it('1つが失敗しても残りを実行し、失敗した処理の名前を付けて投げる', async () => {
    const consoleError = vi.spyOn(console, 'error').mockImplementation(() => {})
    vi.mocked(cleanupExpiredUploadRequests).mockRejectedValue(new Error('storage down'))
    vi.mocked(cleanupUnsentAiAttachments).mockResolvedValue({ removed: 0, failed: 0 })
    vi.mocked(sweepStalePolls).mockClear().mockResolvedValue({ closed: 1, requeued: 0 })

    await expect(runMaintenance()).rejects.toThrow('hourly maintenance failed: expiredUploadRequests')
    expect(sweepStalePolls).toHaveBeenCalledTimes(1)
    consoleError.mockRestore()
  })
})

describe('onTaskAssigned', () => {
  it.each([[false], [true]])('現在の担当権限 %s に従いPushする', async (allowed) => {
    vi.mocked(sendPushToUser).mockClear()
    vi.mocked(canDeliverTaskAssignment).mockResolvedValue(allowed)
    const run = vi.fn(async (name: string, callback: () => unknown) => name === 'send-task-push' ? callback() : undefined)
    await handlers.get('on-task-assigned')!({
      event: { data: { taskId: 'task', taskTitle: '題名', assigneeId: 'user', projectTitle: 'project', workspaceId: 'workspace', assignerName: 'sender' } as unknown as MessageCreatedEvent['data'] },
      step: { run, sleep: vi.fn() },
    })
    expect(canDeliverTaskAssignment).toHaveBeenCalledWith('workspace', 'task', 'user')
    expect(sendPushToUser).toHaveBeenCalledTimes(allowed ? 1 : 0)
  })
})
