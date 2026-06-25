// Copyright 2026 Cairn Contributors
// SPDX-License-Identifier: Apache-2.0

import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

const { mockGetAuthContext, mockRequireWorkspaceOwner } = vi.hoisted(() => ({
  mockGetAuthContext: vi.fn(),
  mockRequireWorkspaceOwner: vi.fn(),
}))

vi.mock('@/lib/get-auth-context', () => ({
  getAuthContext: mockGetAuthContext,
}))

vi.mock('@/lib/permissions', () => ({
  requireWorkspaceOwner: mockRequireWorkspaceOwner,
}))

describe('dev/status API の認可と手動診断', () => {
  const originalNodeEnv = process.env['NODE_ENV']

  beforeEach(() => {
    vi.clearAllMocks()
    mockGetAuthContext.mockResolvedValue({
      ctx: { userId: 'user-1', workspaceId: 'ws-1' },
      error: null,
    })
    mockRequireWorkspaceOwner.mockResolvedValue(null)
    vi.stubGlobal('fetch', vi.fn())
  })

  afterEach(() => {
    vi.unstubAllGlobals()
    Reflect.deleteProperty(process.env, 'DATABASE_URL')
    Reflect.deleteProperty(process.env, 'NEXT_PUBLIC_SUPABASE_URL')
    Reflect.deleteProperty(process.env, 'SUPABASE_SERVICE_ROLE_KEY')
    Reflect.deleteProperty(process.env, 'INNGEST_EVENT_KEY')
    Reflect.deleteProperty(process.env, 'OPENAI_API_KEY')
    Reflect.deleteProperty(process.env, 'TAVILY_API_KEY')
    Reflect.deleteProperty(process.env, 'GOOGLE_MAPS_API_KEY')
    Reflect.deleteProperty(process.env, 'VAPID_PUBLIC_KEY')
    if (originalNodeEnv === undefined) {
      Reflect.deleteProperty(process.env, 'NODE_ENV')
    } else {
      process.env['NODE_ENV' as keyof NodeJS.ProcessEnv] = originalNodeEnv
    }
  })

  it('owner 以外の GET は 403 を返す', async () => {
    mockRequireWorkspaceOwner.mockResolvedValueOnce(
      Response.json({ error: 'この操作にはオーナー権限が必要です' }, { status: 403 }),
    )
    const { GET } = await import('./route')

    const res = await GET()

    expect(res.status).toBe(403)
  })

  it('GET は OpenAI を呼ばず静的状態だけを返す', async () => {
    process.env['OPENAI_API_KEY'] = 'sk-test'
    process.env['NODE_ENV' as keyof NodeJS.ProcessEnv] = 'production'
    const { GET } = await import('./route')

    const res = await GET()
    const body = await res.json() as {
      openai: { status: string; detail?: string }
      env: { nodeEnv: string; hasVapid: boolean }
    }

    expect(res.status).toBe(200)
    expect(body.openai.status).toBe('ok')
    expect(body.openai.detail).toContain('設定済み')
    expect(body.env.nodeEnv).toBe('production')
    expect(fetch).not.toHaveBeenCalled()
  })

  it('POST の手動診断時だけ OpenAI を呼ぶ', async () => {
    process.env['OPENAI_API_KEY'] = 'sk-test'
    vi.mocked(fetch).mockResolvedValueOnce(
      new Response(JSON.stringify({ id: 'chatcmpl-test' }), {
        status: 200,
        headers: { 'Content-Type': 'application/json' },
      }),
    )
    const { POST } = await import('./route')

    const res = await POST()
    const body = await res.json() as {
      openai: { status: string; detail?: string; latencyMs?: number }
    }

    expect(res.status).toBe(200)
    expect(fetch).toHaveBeenCalledTimes(1)
    expect(fetch).toHaveBeenCalledWith(
      'https://api.openai.com/v1/chat/completions',
      expect.objectContaining({ method: 'POST' }),
    )
    expect(body.openai.status).toBe('ok')
    expect(body.openai.detail).toBe('クレジット有効・API 正常')
    expect(body.openai.latencyMs).toEqual(expect.any(Number))
  })
})
