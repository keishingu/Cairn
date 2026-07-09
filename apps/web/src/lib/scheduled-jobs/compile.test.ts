// Copyright 2026 Cairn Contributors
// SPDX-License-Identifier: Apache-2.0

import { beforeEach, describe, expect, it, vi } from 'vitest'

const { generateObject } = vi.hoisted(() => ({
  generateObject: vi.fn(),
}))

vi.mock('ai', () => ({
  generateObject,
}))

vi.mock('@/lib/ai/client', () => ({
  FAST_MODEL: 'gpt-4o-mini',
  openai: vi.fn(() => 'mock-model'),
}))

import { compileScheduledJobInstruction, ScheduledJobCompileError } from './compile'

describe('compileScheduledJobInstruction', () => {
  beforeEach(() => {
    generateObject.mockReset()
  })

  it('LLM出力を channel/member 解決して preview へ落とす', async () => {
    generateObject.mockResolvedValue({
      object: {
        channelName: '登山本部',
        mentionNames: ['山田', '田中'],
        schedule: { type: 'monthly', dayOfMonth: 15, hour: 9, minute: 0 },
        actionSpec: {
          type: 'poll',
          prompt: '来月の各週',
          choicesPrompt: '来月の各週を列挙',
          allowMultiple: true,
          anonymous: false,
        },
      },
    })

    const compiled = await compileScheduledJobInstruction('dummy', {
      channelCandidates: [{ id: 'channel-1', name: '登山本部' }],
      memberCandidates: [
        { id: 'user-1', displayName: '山田' },
        { id: 'user-2', displayName: '田中' },
      ],
      now: new Date('2026-07-09T05:00:00.000Z'),
    })

    expect(compiled.channelId).toBe('channel-1')
    expect(compiled.mentionUserIds).toEqual(['user-1', 'user-2'])
    expect(compiled.preview).toContain('#登山本部')
    expect(compiled.preview).toContain('@山田 @田中')
  })

  it('曖昧なメンバー名は保存エラーにする', async () => {
    generateObject.mockResolvedValue({
      object: {
        channelName: '登山本部',
        mentionNames: ['山田'],
        schedule: { type: 'monthly', dayOfMonth: 15, hour: 9, minute: 0 },
        actionSpec: {
          type: 'poll',
          prompt: '来月の各週',
          choicesPrompt: '来月の各週を列挙',
          allowMultiple: false,
          anonymous: false,
        },
      },
    })

    await expect(compileScheduledJobInstruction('dummy', {
      channelCandidates: [{ id: 'channel-1', name: '登山本部' }],
      memberCandidates: [
        { id: 'user-1', displayName: '山田' },
        { id: 'user-2', displayName: '山田' },
      ],
      now: new Date('2026-07-09T05:00:00.000Z'),
    })).rejects.toBeInstanceOf(ScheduledJobCompileError)
  })
})
