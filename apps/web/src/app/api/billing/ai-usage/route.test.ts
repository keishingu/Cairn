// Copyright 2026 Cairn Contributors
// SPDX-License-Identifier: Apache-2.0

import { beforeEach, describe, expect, it, vi } from 'vitest'

const { mockGetAuthContext, mockIsBillingEnabled, selectResults, selectCount } = vi.hoisted(() => ({
  mockGetAuthContext: vi.fn(),
  mockIsBillingEnabled: vi.fn(),
  selectResults: [] as unknown[][],
  selectCount: { value: 0 },
}))

vi.mock('@/lib/get-auth-context', () => ({ getAuthContext: mockGetAuthContext }))
vi.mock('@/lib/billing/is-billing-enabled', () => ({ isBillingEnabled: mockIsBillingEnabled }))
// select ごとに用意した結果を順に返す。from / where / orderBy / groupBy / limit はどこで await しても同じ結果になる
vi.mock('@cairn/db', () => ({
  aiChatUsage: {
    workspaceId: 'workspaceId',
    userId: 'userId',
    createdAt: 'createdAt',
    model: 'model',
    status: 'status',
    creditsCharged: 'creditsCharged',
    requestCredits: 'requestCredits',
  },
  db: {
    select: () => {
      selectCount.value += 1
      const result = Promise.resolve(selectResults.shift() ?? [])
      const chain: Record<string, unknown> = {
        then: result.then.bind(result),
      }
      for (const name of ['from', 'where', 'orderBy', 'groupBy', 'limit']) chain[name] = () => chain
      return chain
    },
  },
}))

import { GET } from './route'

const ctx = (role: string) => ({ ctx: { workspaceId: 'ws-1', userId: 'user-1', role }, error: null })

describe('GET /api/billing/ai-usage', () => {
  beforeEach(() => {
    selectResults.length = 0
    selectCount.value = 0
    mockIsBillingEnabled.mockReturnValue(true)
  })

  it('member には自分の明細と合計だけを返し、ワークスペース全体は集計しない', async () => {
    mockGetAuthContext.mockResolvedValue(ctx('member'))
    selectResults.push(
      [{ createdAt: new Date('2026-11-10T03:00:00Z'), model: 'claude-sonnet-5-5', credits: '30' }],
      [{ requests: '1', credits: '30' }],
    )

    const response = await GET()
    const body = await response.json()

    expect(response.status).toBe(200)
    expect(body.mine).toEqual({
      requests: 1,
      credits: 30,
      items: [{ createdAt: '2026-11-10T03:00:00.000Z', model: 'claude-sonnet-5-5', credits: 30 }],
    })
    expect(body.workspace).toBeNull()
    expect(selectCount.value).toBe(2)
  })

  it('owner / admin にはワークスペース全体のモデル別の合計も返す', async () => {
    for (const role of ['owner', 'admin']) {
      mockGetAuthContext.mockResolvedValue(ctx(role))
      selectResults.push(
        [],
        [{ requests: '0', credits: '0' }],
        [
          { model: 'claude-opus-5-5', requests: '2', credits: '90' },
          { model: 'gpt-5', requests: '3', credits: '60' },
        ],
      )

      const body = await (await GET()).json()

      expect(body.workspace).toEqual({
        requests: 5,
        credits: 150,
        byModel: [
          { model: 'claude-opus-5-5', requests: 2, credits: 90 },
          { model: 'gpt-5', requests: 3, credits: 60 },
        ],
      })
    }
  })

  it('課金が無効なら集計せず空で返す', async () => {
    mockIsBillingEnabled.mockReturnValue(false)
    mockGetAuthContext.mockResolvedValue(ctx('owner'))

    const body = await (await GET()).json()

    expect(body).toMatchObject({ billingEnabled: false, mine: { requests: 0, credits: 0, items: [] }, workspace: null })
    expect(selectCount.value).toBe(0)
  })

  it('集計に失敗したら0として見せず500を返す', async () => {
    mockGetAuthContext.mockResolvedValue(ctx('member'))
    const { db } = await import('@cairn/db')
    const select = vi.spyOn(db, 'select').mockImplementation(() => {
      throw new Error('db down')
    })

    const response = await GET()

    expect(response.status).toBe(500)
    select.mockRestore()
  })
})
