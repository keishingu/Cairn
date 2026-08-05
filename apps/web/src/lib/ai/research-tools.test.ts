// Copyright 2026 Cairn Contributors
// SPDX-License-Identifier: Apache-2.0

import { afterEach, describe, expect, test, vi } from 'vitest'

const { mockListResearchProjects } = vi.hoisted(() => ({
  mockListResearchProjects: vi.fn(),
}))

vi.mock('./workspace-research', () => ({
  ResearchAccessError: class ResearchAccessError extends Error {
    readonly code = 'ACCESS_DENIED'
  },
  listResearchProjects: mockListResearchProjects,
  listResearchProjectTasks: vi.fn(),
  getResearchRiskSnapshot: vi.fn(),
  searchResearchChannelMessages: vi.fn(),
  searchResearchDocuments: vi.fn(),
}))

const CTX = {
  workspaceId: '10000000-0000-4000-8000-000000000001',
  userId: '20000000-0000-4000-8000-000000000001',
  role: 'member' as const,
}

describe('AI横断調査toolの信頼境界', () => {
  afterEach(() => vi.clearAllMocks())

  test('workspaceIdとuserIdをtool inputに含めず認証ctxで固定する', async () => {
    mockListResearchProjects.mockResolvedValue({ ok: true, items: [] })
    const { createResearchTools } = await import('./research-tools')
    const tools = createResearchTools(CTX)
    const parsed = tools.list_projects.parameters.parse({
      workspaceId: 'ffffffff-ffff-4fff-8fff-ffffffffffff',
      userId: 'ffffffff-ffff-4fff-8fff-ffffffffffff',
      includeArchived: null,
      limit: 1,
    })
    expect(parsed).toEqual({ includeArchived: null, limit: 1 })

    await tools.list_projects.execute?.(parsed, {
      toolCallId: 'tool-1',
      messages: [],
    })
    expect(mockListResearchProjects).toHaveBeenCalledWith(CTX, {
      includeArchived: undefined,
      limit: 1,
    })
  })

  test('OpenAI strict schema向けに任意入力もrequiredかつnull許容にする', async () => {
    const { createResearchTools } = await import('./research-tools')
    const tools = createResearchTools(CTX)

    expect(() => tools.list_projects.parameters.parse({ limit: 1 })).toThrow()
    expect(
      tools.search_channel_messages.parameters.parse({
        query: null,
        projectId: null,
        channelId: null,
        lookbackDays: null,
        limit: null,
      }),
    ).toEqual({
      query: null,
      projectId: null,
      channelId: null,
      lookbackDays: null,
      limit: null,
    })
  })

  test('推奨された5つの読み取り専用toolだけを構成する', async () => {
    const { createResearchTools } = await import('./research-tools')
    expect(Object.keys(createResearchTools(CTX))).toEqual([
      'list_projects',
      'list_project_tasks',
      'get_project_risk_snapshot',
      'search_channel_messages',
      'search_workspace_documents',
    ])
  })

  test('問い合わせ失敗を空配列にせず調査不能エラーとして返す', async () => {
    vi.spyOn(console, 'error').mockImplementation(() => undefined)
    mockListResearchProjects.mockRejectedValue(new Error('database unavailable'))
    const { createResearchTools } = await import('./research-tools')
    const result = await createResearchTools(CTX).list_projects.execute?.({}, {
      toolCallId: 'tool-2',
      messages: [],
    })
    expect(result).toEqual({
      ok: false,
      error: {
        code: 'QUERY_FAILED',
        message: '調査データの取得に失敗しました。この範囲は調査できなかったものとして扱ってください。',
      },
    })
  })
})
