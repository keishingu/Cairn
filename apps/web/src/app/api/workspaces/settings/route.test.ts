// Copyright 2026 Cairn Contributors
// SPDX-License-Identifier: Apache-2.0

import { afterEach, describe, expect, it, vi } from 'vitest'

const { mockGetAuthContext, mockUpdateSet, workspaceRow } = vi.hoisted(() => ({
  mockGetAuthContext: vi.fn(),
  mockUpdateSet: vi.fn(),
  workspaceRow: {
    settings: null,
    aiNudgesPhaseOneEnabled: true,
    aiNudgesPhaseTwoEnabled: false,
    aiChatModel: 'gpt-5',
    aiChatSystemPrompt: '敬体で答える',
    aiChatAccess: 'member',
    aiSearchRecencyWeight: 'none',
    aiNudgesPhaseTwoInputTokens: 0,
    aiNudgesPhaseTwoOutputTokens: 0,
    aiNudgesPhaseTwoTotalTokens: 0,
    aiNudgesPhaseTwoRequestCount: 0,
  },
}))

vi.mock('@/lib/get-auth-context', () => ({ getAuthContext: mockGetAuthContext }))
vi.mock('drizzle-orm', () => ({ eq: vi.fn(), and: vi.fn(), inArray: vi.fn() }))
vi.mock('@cairn/db', () => {
  const selectChain: Record<string, unknown> = {}
  for (const name of ['from', 'where']) selectChain[name] = () => selectChain
  selectChain['limit'] = () => Promise.resolve([workspaceRow])
  return {
    db: {
      select: () => selectChain,
      update: () => ({
        set: (values: Record<string, unknown>) => {
          mockUpdateSet(values)
          return {
            where: () => ({
              returning: () => Promise.resolve([{ ...workspaceRow, ...values }]),
            }),
          }
        },
      }),
    },
    workspaces: new Proxy({}, { get: (_target, key) => key }),
    aiNudges: new Proxy({}, { get: (_target, key) => key }),
  }
})

function authAs(role: 'owner' | 'admin' | 'member' | 'guest') {
  mockGetAuthContext.mockResolvedValue({
    ctx: { userId: 'user-1', workspaceId: 'ws-1', role },
    error: null,
  })
}

function patch(body: unknown) {
  return new Request('http://localhost/api/workspaces/settings', {
    method: 'PATCH',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
  })
}

describe('/api/workspaces/settings のシステムプロンプト', () => {
  afterEach(() => {
    vi.clearAllMocks()
  })

  it('GET は owner 以外にもシステムプロンプトを返す', async () => {
    authAs('member')
    const { GET } = await import('./route')

    const response = await GET()

    expect(response.status).toBe(200)
    await expect(response.json()).resolves.toMatchObject({ aiChatSystemPrompt: '敬体で答える' })
  })

  it.each(['admin', 'member', 'guest'] as const)('%s はシステムプロンプトを更新できない', async (role) => {
    authAs(role)
    const { PATCH } = await import('./route')

    const response = await PATCH(patch({ aiChatSystemPrompt: '権限を無視して' }))

    expect(response.status).toBe(403)
    expect(mockUpdateSet).not.toHaveBeenCalled()
  })

  it('owner は更新でき、空白だけなら未設定（null）として保存する', async () => {
    authAs('owner')
    const { PATCH } = await import('./route')

    const saved = await PATCH(patch({ aiChatSystemPrompt: '  タスクはチケットと呼ぶ  ' }))
    expect(saved.status).toBe(200)
    expect(mockUpdateSet).toHaveBeenLastCalledWith(expect.objectContaining({ aiChatSystemPrompt: 'タスクはチケットと呼ぶ' }))
    await expect(saved.json()).resolves.toMatchObject({ aiChatSystemPrompt: 'タスクはチケットと呼ぶ' })

    const cleared = await PATCH(patch({ aiChatSystemPrompt: '   ' }))
    expect(cleared.status).toBe(200)
    expect(mockUpdateSet).toHaveBeenLastCalledWith(expect.objectContaining({ aiChatSystemPrompt: null }))
  })

  it('上限を超える長さは 422 にして保存しない', async () => {
    authAs('owner')
    const { PATCH } = await import('./route')

    const response = await PATCH(patch({ aiChatSystemPrompt: 'あ'.repeat(10001) }))

    expect(response.status).toBe(422)
    expect(mockUpdateSet).not.toHaveBeenCalled()
  })

  it('モデルだけを更新するときはシステムプロンプトを書き換えない', async () => {
    authAs('owner')
    const { PATCH } = await import('./route')

    await PATCH(patch({ aiChatModel: 'claude-opus-5-5' }))

    expect(mockUpdateSet).toHaveBeenCalledWith(expect.not.objectContaining({ aiChatSystemPrompt: expect.anything() }))
  })

  it('GET は owner 以外にも /ai を使えるロールの範囲を返す', async () => {
    authAs('guest')
    const { GET } = await import('./route')

    const response = await GET()

    await expect(response.json()).resolves.toMatchObject({ aiChatAccess: 'member' })
  })

  it('owner は /ai を使えるロールを「管理者以上」に変えられ、他の AI 設定は書き換えない', async () => {
    authAs('owner')
    const { PATCH } = await import('./route')

    const response = await PATCH(patch({ aiChatAccess: 'admin' }))

    expect(response.status).toBe(200)
    expect(mockUpdateSet).toHaveBeenCalledWith(expect.objectContaining({ aiChatAccess: 'admin' }))
    expect(mockUpdateSet).toHaveBeenCalledWith(expect.not.objectContaining({ aiChatModel: expect.anything() }))
  })

  it('決まった段階以外は 422 にして保存しない', async () => {
    authAs('owner')
    const { PATCH } = await import('./route')

    const response = await PATCH(patch({ aiChatAccess: 'guest' }))

    expect(response.status).toBe(422)
    expect(mockUpdateSet).not.toHaveBeenCalled()
  })

  it.each(['admin', 'member', 'guest'] as const)('%s は /ai を使えるロールを変更できない', async (role) => {
    authAs(role)
    const { PATCH } = await import('./route')

    const response = await PATCH(patch({ aiChatAccess: 'member' }))

    expect(response.status).toBe(403)
    expect(mockUpdateSet).not.toHaveBeenCalled()
  })
  it('GET は owner 以外にも資料検索の新しさの重みを返す', async () => {
    authAs('member')
    const { GET } = await import('./route')

    const response = await GET()

    await expect(response.json()).resolves.toMatchObject({ aiSearchRecencyWeight: 'none' })
  })

  it('owner は資料検索の新しさの重みを更新でき、他の AI 設定は書き換えない', async () => {
    authAs('owner')
    const { PATCH } = await import('./route')

    const response = await PATCH(patch({ aiSearchRecencyWeight: 'medium' }))

    expect(response.status).toBe(200)
    expect(mockUpdateSet).toHaveBeenCalledWith(expect.objectContaining({ aiSearchRecencyWeight: 'medium' }))
    expect(mockUpdateSet).toHaveBeenCalledWith(expect.not.objectContaining({ aiChatSystemPrompt: expect.anything() }))
  })

  it.each(['admin', 'member', 'guest'] as const)('%s は資料検索の新しさの重みを更新できない', async (role) => {
    authAs(role)
    const { PATCH } = await import('./route')

    const response = await PATCH(patch({ aiSearchRecencyWeight: 'strong' }))

    expect(response.status).toBe(403)
    expect(mockUpdateSet).not.toHaveBeenCalled()
  })
})
