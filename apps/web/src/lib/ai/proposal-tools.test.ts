// Copyright 2026 Cairn Contributors
// SPDX-License-Identifier: Apache-2.0

import { afterEach, describe, expect, test, vi } from 'vitest'

const { mockPropose, mockValidate } = vi.hoisted(() => ({ mockPropose: vi.fn(), mockValidate: vi.fn() }))
const ALL = ['post_message', 'invite_project_member', 'set_project_member_role', 'create_task'] as const

vi.mock('./pending-actions', () => ({
  POST_MESSAGE_MAX_LENGTH: 4000,
  PendingActionError: class PendingActionError extends Error {
    constructor(
      readonly status: number,
      message: string,
    ) {
      super(message)
    }
  },
  proposePendingAction: mockPropose,
  validateProposal: mockValidate,
}))

const CTX = {
  workspaceId: '10000000-0000-4000-8000-000000000001',
  userId: '20000000-0000-4000-8000-000000000001',
  role: 'admin' as const,
}
const CONVERSATION_ID = '60000000-0000-4000-8000-000000000001'
const CHANNEL_ID = '50000000-0000-4000-8000-000000000001'

describe('実行案を作るtool', () => {
  afterEach(() => vi.clearAllMocks())

  test('実行せずに実行案だけを作り、未実行であることをAIに伝える', async () => {
    mockPropose.mockResolvedValue({ id: 'action-1', actionType: 'post_message', status: 'pending' })
    const { createProposalTools } = await import('./proposal-tools')
    const result = await createProposalTools(CTX, CONVERSATION_ID, { allowed: ALL }).propose_post_message!.execute?.(
      { channelId: CHANNEL_ID, text: '<@user-1> レビューをお願いします', reason: null },
      { toolCallId: 'tool-1', messages: [] },
    )
    expect(mockPropose).toHaveBeenCalledWith(CTX, {
      conversationId: CONVERSATION_ID,
      actionType: 'post_message',
      payload: { channelId: CHANNEL_ID, text: '<@user-1> レビューをお願いします' },
      reason: null,
    })
    expect(result).toMatchObject({
      ok: true,
      pendingAction: { id: 'action-1', status: 'pending' },
      note: expect.stringContaining('実行されていません'),
    })
  })

  test('見えない対象を指す案は作らず、理由をAIに返す', async () => {
    const { PendingActionError } = await import('./pending-actions')
    mockPropose.mockRejectedValue(new PendingActionError(404, 'チャンネルが見つからないか、アクセスできません'))
    const { createProposalTools } = await import('./proposal-tools')
    const result = await createProposalTools(CTX, CONVERSATION_ID, { allowed: ALL }).propose_post_message!.execute?.(
      { channelId: CHANNEL_ID, text: '本文', reason: null },
      { toolCallId: 'tool-2', messages: [] },
    )
    expect(result).toEqual({
      ok: false,
      error: { code: 'INVALID_PROPOSAL', message: 'チャンネルが見つからないか、アクセスできません' },
    })
  })

  test('スキルで許可されていない種類のtoolは渡さない', async () => {
    const { createProposalTools } = await import('./proposal-tools')
    expect(Object.keys(createProposalTools(CTX, CONVERSATION_ID, { allowed: ['invite_project_member'] }))).toEqual([
      'propose_invite_project_member',
    ])
    expect(createProposalTools(CTX, CONVERSATION_ID, { allowed: [] })).toEqual({})
  })

  test('dry-runでは実行案を保存せず、確かめた内容だけを集める', async () => {
    mockValidate.mockResolvedValue({ payload: { channelId: CHANNEL_ID, text: '本文' }, display: { channel: { id: CHANNEL_ID, name: '審議' } } })
    const { createProposalTools } = await import('./proposal-tools')
    const dryRun = { proposals: [] as unknown[] }
    const result = await createProposalTools(CTX, null, { allowed: ALL, dryRun: dryRun as never }).propose_post_message!.execute?.(
      { channelId: CHANNEL_ID, text: '本文', reason: '確認のため' },
      { toolCallId: 'tool-3', messages: [] },
    )
    expect(mockPropose).not.toHaveBeenCalled()
    expect(result).toMatchObject({ ok: true, dryRun: true })
    expect(dryRun.proposals).toEqual([
      {
        actionType: 'post_message',
        payload: { channelId: CHANNEL_ID, text: '本文' },
        display: { channel: { id: CHANNEL_ID, name: '審議' } },
        reason: '確認のため',
      },
    ])
  })
})
