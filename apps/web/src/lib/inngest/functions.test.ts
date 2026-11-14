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

import './functions'
import { sendPushToUser } from '@/lib/push/send'
import { getWorkspaceRole } from '@/lib/access/membership'
import { canAccessChannel } from '@/lib/permissions'
import { canDeliverTaskAssignment } from '@/lib/tasks/assignment-delivery'
import { cleanupExpiredUploadRequests } from '@/lib/uploads/cleanup'
import { cleanupUnsentAiAttachments } from '@/lib/ai/attachments'
import { sweepStalePolls } from '@/first-party-apps/polls'

function stepNames(run: ReturnType<typeof vi.fn>) {
  return run.mock.calls.map(([name]) => name as string)
}

describe('onMessageCreated', () => {
  it('添付があっても通知対象メンバーが0人なら空配列をinsertしない', async () => {
    const handler = handlers.get('on-message-created')
    expect(handler).toBeDefined()

    const run = vi.fn(async (name: string) => {
      switch (name) {
        case 'fetch-members':
        case 'filter-blocked-members':
        case 'filter-mention-access':
        case 'filter-blocked-mentions':
        case 'expand-all-mention':
        case 'expand-project-members-mention':
        case 'expand-attr-mentions':
          return []
        case 'resolve-mention-preview-names':
          return {}
        case 'resolve-current-channel':
          return 'channel-id'
        case 'check-dm':
          return false
        case 'fetch-reply-target':
          return []
        case 'fetch-mentioned-members':
          return [{ userId: 'mentioned-user', displayName: 'メンバー' }]
        default:
          throw new Error(`Unexpected step: ${name}`)
      }
    })

    await expect(
      handler!({
        event: {
          data: {
            messageId: 'message-id',
            channelId: 'channel-id',
            workspaceId: 'workspace-id',
            senderId: 'sender-id',
            senderName: '送信者',
            content: '<@mentioned-user> ファイルです',
            attachmentFileIds: ['file-id'],
          },
        },
        step: { run, sleep: vi.fn() },
      }),
    ).resolves.toEqual({ mentionNotifications: 0, fileNotifications: 0 })

    expect(stepNames(run)).not.toContain('create-file-notifications')
  })

  it('@all と @project_members と属性メンションを展開ステップへ渡す', async () => {
    const handler = handlers.get('on-message-created')
    expect(handler).toBeDefined()

    const run = vi.fn(async (name: string) => {
      switch (name) {
        case 'fetch-members':
        case 'filter-blocked-members':
        case 'filter-mention-access':
        case 'filter-blocked-mentions':
          return []
        case 'expand-all-mention':
          return [{ userId: 'u-all', displayName: '全員候補' }]
        case 'expand-project-members-mention':
          return [{ userId: 'u-proj', displayName: 'PJ候補' }]
        case 'expand-attr-mentions':
          return [{ userId: 'u-attr', displayName: '属性候補' }]
        case 'resolve-mention-preview-names':
          return { all: 'all', project_members: 'project_members', 'attr:attr-1': 'コーチ' }
        case 'resolve-current-channel':
          return 'channel-id'
        case 'check-dm':
          return false
        case 'fetch-reply-target':
          return []
        default:
          throw new Error(`Unexpected step: ${name}`)
      }
    })

    await expect(
      handler!({
        event: {
          data: {
            messageId: 'message-id',
            channelId: 'channel-id',
            workspaceId: 'workspace-id',
            senderId: 'sender-id',
            senderName: '送信者',
            content: '<@all> <@project_members> <@attr:attr-1> 確認',
            attachmentFileIds: [],
          },
        },
        step: { run, sleep: vi.fn() },
      }),
    ).resolves.toEqual({ mentionNotifications: 0, fileNotifications: 0 })

    const names = stepNames(run)
    expect(names).toContain('expand-all-mention')
    expect(names).toContain('expand-project-members-mention')
    expect(names).toContain('expand-attr-mentions')
    expect(names).not.toContain('fetch-mentioned-members')
  })
  it('プロジェクトの役割メンションを展開ステップへ渡し、ユーザーメンションとして扱わない', async () => {
    const handler = handlers.get('on-message-created')
    expect(handler).toBeDefined()

    const run = vi.fn(async (name: string) => {
      switch (name) {
        case 'fetch-members':
        case 'filter-blocked-members':
        case 'filter-mention-access':
        case 'filter-blocked-mentions':
          return []
        case 'expand-role-mentions':
          return [{ userId: 'u-reviewer', displayName: 'レビュワー候補' }]
        case 'resolve-mention-preview-names':
          return { 'role:role-1': 'レビュワー' }
        case 'resolve-current-channel':
          return 'channel-id'
        case 'check-dm':
          return false
        case 'fetch-reply-target':
          return []
        default:
          throw new Error(`Unexpected step: ${name}`)
      }
    })

    await expect(
      handler!({
        event: {
          data: {
            messageId: 'message-id',
            channelId: 'channel-id',
            workspaceId: 'workspace-id',
            senderId: 'sender-id',
            senderName: '送信者',
            content: '<@role:role-1> 確認お願いします',
            attachmentFileIds: [],
          },
        },
        step: { run, sleep: vi.fn() },
      }),
    ).resolves.toEqual({ mentionNotifications: 0, fileNotifications: 0 })

    const names = stepNames(run)
    expect(names).toContain('expand-role-mentions')
    expect(names).not.toContain('fetch-mentioned-members')
  })
  it('スレッドへ移動済みでも通知の宛先を決める前に今のチャンネルを読み直す', async () => {
    const handler = handlers.get('on-message-created')
    expect(handler).toBeDefined()

    const run = vi.fn(async (name: string) => {
      switch (name) {
        case 'resolve-current-channel':
          return 'thread-id'
        case 'fetch-members':
        case 'filter-blocked-members':
        case 'filter-mention-access':
        case 'filter-blocked-mentions':
        case 'expand-all-mention':
        case 'expand-project-members-mention':
        case 'expand-attr-mentions':
          return []
        case 'resolve-mention-preview-names':
          return {}
        case 'check-dm':
          return false
        case 'fetch-reply-target':
          return []
        default:
          throw new Error(`Unexpected step: ${name}`)
      }
    })

    await handler!({
      event: {
        data: {
          messageId: 'message-id',
          channelId: 'parent-channel-id',
          workspaceId: 'workspace-id',
          senderId: 'sender-id',
          senderName: '送信者',
          content: '確認',
          attachmentFileIds: [],
        },
      },
      step: { run, sleep: vi.fn() },
    })

    expect(stepNames(run)[0]).toBe('resolve-current-channel')
  })
  it('猶予中にスレッドへ移動されても、メンションPushは送る直前のチャンネルとメッセージIDで開かせる', async () => {
    const handler = handlers.get('on-message-created')
    expect(handler).toBeDefined()
    const mentioned = { userId: 'mentioned-user', displayName: 'メンバー' }

    const run = vi.fn(async (name: string, callback: () => unknown) => {
      switch (name) {
        case 'resolve-current-channel':
          return 'parent-channel-id'
        case 'resolve-push-channel':
          return 'thread-id'
        case 'fetch-members':
        case 'filter-blocked-members':
        case 'expand-all-mention':
        case 'expand-project-members-mention':
        case 'expand-attr-mentions':
          return []
        case 'resolve-mention-preview-names':
          return {}
        case 'check-dm':
          return false
        case 'fetch-reply-target':
          return []
        case 'fetch-mentioned-members':
        case 'filter-mention-access':
        case 'filter-blocked-mentions':
          return [mentioned]
        case 'resolve-recipient-locales':
          return { 'mentioned-user': 'ja' }
        case 'create-mention-notifications':
          return undefined
        case 'filter-mention-push-targets':
          return { readRecipients: [], unreadRecipients: [mentioned] }
        case 'send-mention-push':
          return callback()
        default:
          throw new Error(`Unexpected step: ${name}`)
      }
    })

    await handler!({
      event: {
        data: {
          messageId: 'message-id',
          channelId: 'parent-channel-id',
          workspaceId: 'workspace-id',
          senderId: 'sender-id',
          senderName: '送信者',
          content: '<@mentioned-user> 確認',
          attachmentFileIds: [],
        },
      },
      step: { run, sleep: vi.fn() },
    })

    const names = stepNames(run)
    expect(names.indexOf('resolve-push-channel')).toBeLessThan(names.indexOf('filter-mention-push-targets'))
    expect(sendPushToUser).toHaveBeenCalledWith(
      'mentioned-user',
      expect.objectContaining({ url: '/chats/thread-id?m=message-id' }),
      { updateAppBadge: true },
    )
  })

  it('現在も権限のあるDM受信者へPushを送る', async () => {
    vi.mocked(sendPushToUser).mockClear()
    const member = { userId: 'recipient', displayName: '受信者' }
    const run = vi.fn(async (name: string, callback: () => unknown) => {
      switch (name) {
        case 'resolve-current-channel': return 'channel-id'
        case 'fetch-members':
        case 'filter-blocked-members': return [member]
        case 'check-dm': return true
        case 'create-dm-notifications': return undefined
        case 'filter-dm-push-targets': return { readRecipients: [], unreadRecipients: [member] }
        case 'send-dm-push': return callback()
        default: throw new Error(`Unexpected step: ${name}`)
      }
    })
    await handlers.get('on-message-created')!({
      event: { data: { messageId: 'message-id', channelId: 'channel-id', workspaceId: 'workspace-id', senderId: 'sender', senderName: '送信者', content: '本文', attachmentFileIds: [] } },
      step: { run, sleep: vi.fn() },
    })
    expect(sendPushToUser).toHaveBeenCalledWith('recipient', expect.objectContaining({ body: '本文' }))
  })

  it.each([
    ['非活性化', null, true],
    ['チャンネル権限の削除', 'member', false],
  ] as const)('猶予中に%sされた受信者へメンション本文をPushしない', async (_change, role, accessible) => {
    vi.mocked(sendPushToUser).mockClear()
    vi.mocked(getWorkspaceRole).mockResolvedValue(role)
    vi.mocked(canAccessChannel).mockResolvedValue(accessible)
    const recipient = { userId: 'mentioned-user', displayName: 'メンバー' }
    const run = vi.fn(async (name: string, callback: () => unknown) => {
      switch (name) {
        case 'resolve-current-channel':
        case 'resolve-push-channel': return 'channel-id'
        case 'fetch-members':
        case 'filter-blocked-members':
        case 'fetch-reply-target': return []
        case 'check-dm': return false
        case 'fetch-mentioned-members':
        case 'filter-mention-access':
        case 'filter-blocked-mentions': return [recipient]
        case 'resolve-mention-preview-names': return {}
        case 'resolve-recipient-locales': return { 'mentioned-user': 'ja' }
        case 'create-mention-notifications': return undefined
        case 'filter-mention-push-targets': return { readRecipients: [], unreadRecipients: [recipient] }
        case 'send-mention-push': return callback()
        default: throw new Error(`Unexpected step: ${name}`)
      }
    })
    await handlers.get('on-message-created')!({
      event: { data: { messageId: 'message-id', channelId: 'channel-id', workspaceId: 'workspace-id', senderId: 'sender-id', senderName: '送信者', content: '<@mentioned-user> 秘密', attachmentFileIds: [] } },
      step: { run, sleep: vi.fn() },
    })
    expect(sendPushToUser).not.toHaveBeenCalled()
    vi.mocked(getWorkspaceRole).mockResolvedValue('member')
    vi.mocked(canAccessChannel).mockResolvedValue(true)
  })

  describe('返信の通知', () => {
    function runReply(content: string, options: {
      replyTargets: { userId: string; displayName: string }[]
      mentioned?: { userId: string; displayName: string }[]
      accessible?: { userId: string; displayName: string }[]
      locales?: Record<string, string>
    }) {
      const handler = handlers.get('on-message-created')
      const run = vi.fn(async (name: string, callback: () => unknown) => {
        switch (name) {
          case 'resolve-current-channel':
          case 'resolve-push-channel':
            return 'channel-id'
          case 'fetch-members':
          case 'filter-blocked-members':
            return []
          case 'check-dm':
            return false
          case 'fetch-reply-target':
            return options.replyTargets
          case 'fetch-mentioned-members':
            return options.mentioned ?? []
          case 'resolve-mention-preview-names':
            return {}
          case 'filter-mention-access':
          case 'filter-blocked-mentions':
            return options.accessible ?? [...options.replyTargets, ...(options.mentioned ?? [])]
          case 'resolve-recipient-locales':
            return options.locales ?? { author: 'ja' }
          case 'create-mention-notifications':
            return undefined
          case 'filter-mention-push-targets':
            return {
              readRecipients: [],
              unreadRecipients: options.accessible ?? [...options.replyTargets, ...(options.mentioned ?? [])],
            }
          case 'send-mention-push':
            return callback()
          default:
            throw new Error(`Unexpected step: ${name}`)
        }
      })
      const result = handler!({
        event: {
          data: {
            messageId: 'message-id',
            channelId: 'channel-id',
            workspaceId: 'workspace-id',
            senderId: 'sender-id',
            senderName: '送信者',
            content,
            attachmentFileIds: [],
          },
        },
        step: { run, sleep: vi.fn() },
      })
      return { run, result }
    }

    it('メンションがなくても返信元の投稿者に返信として通知する', async () => {
      vi.mocked(sendPushToUser).mockClear()
      const author = { userId: 'author', displayName: '返信元' }
      const { run, result } = runReply('了解です', { replyTargets: [author] })

      await expect(result).resolves.toEqual({ mentionNotifications: 1, fileNotifications: 0 })
      expect(stepNames(run)).toContain('create-mention-notifications')
      expect(sendPushToUser).toHaveBeenCalledWith(
        'author',
        expect.objectContaining({ title: '送信者 があなたのメッセージに返信しました' }),
        { updateAppBadge: true },
      )
    })

    it('返信元がメンションもされているときはメンションの文言で1件だけ通知する', async () => {
      vi.mocked(sendPushToUser).mockClear()
      const author = { userId: 'author', displayName: '返信元' }
      const { result } = runReply('<@author> 了解です', {
        replyTargets: [author],
        mentioned: [author],
        accessible: [author],
      })

      await expect(result).resolves.toEqual({ mentionNotifications: 1, fileNotifications: 0 })
      expect(sendPushToUser).toHaveBeenCalledTimes(1)
      expect(sendPushToUser).toHaveBeenCalledWith(
        'author',
        expect.objectContaining({ title: '送信者 があなたをメンションしました' }),
        { updateAppBadge: true },
      )
    })

    it('返信元がアクセス・ブロックの絞り込みで外れたら通知しない', async () => {
      vi.mocked(sendPushToUser).mockClear()
      const author = { userId: 'author', displayName: '返信元' }
      const { run, result } = runReply('了解です', { replyTargets: [author], accessible: [] })

      await expect(result).resolves.toEqual({ mentionNotifications: 0, fileNotifications: 0 })
      expect(stepNames(run)).not.toContain('create-mention-notifications')
      expect(sendPushToUser).not.toHaveBeenCalled()
    })
    it('返信の通知タイトルを受信者の表示言語で送る', async () => {
      vi.mocked(sendPushToUser).mockClear()
      const author = { userId: 'author', displayName: '返信元' }
      const { result } = runReply('OK', { replyTargets: [author], locales: { author: 'en' } })

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
