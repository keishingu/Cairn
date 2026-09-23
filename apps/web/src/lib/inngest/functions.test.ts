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

import './functions'

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
        case 'check-dm':
          return false
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

    expect(run.mock.calls.map(([name]) => name)).not.toContain('create-file-notifications')
  })
})
