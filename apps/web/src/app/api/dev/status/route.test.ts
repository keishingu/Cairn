// Copyright 2026 Cairn Contributors
// SPDX-License-Identifier: Apache-2.0

import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

const ENV_KEYS_TO_RESTORE = [
  'DATABASE_URL',
  'NEXT_PUBLIC_SUPABASE_URL',
  'SUPABASE_SERVICE_ROLE_KEY',
  'INNGEST_EVENT_KEY',
  'OPENAI_API_KEY',
  'ANTHROPIC_API_KEY',
  'TAVILY_API_KEY',
  'GOOGLE_MAPS_API_KEY',
  'VAPID_PUBLIC_KEY',
  'NODE_ENV',
] as const

const { mockGetAuthContext, mockRequireRole } = vi.hoisted(() => ({
  mockGetAuthContext: vi.fn(),
  mockRequireRole: vi.fn(),
}))

vi.mock('@/lib/get-auth-context', () => ({
  getAuthContext: mockGetAuthContext,
}))

vi.mock('@/lib/permissions', () => ({
  requireRole: mockRequireRole,
}))

describe('dev/status API の認可と手動診断', () => {
  const originalEnv = Object.fromEntries(
    ENV_KEYS_TO_RESTORE.map((key) => [key, process.env[key]]),
  ) as Record<(typeof ENV_KEYS_TO_RESTORE)[number], string | undefined>
  const clearDiagnosticEnv = () => {
    for (const key of ENV_KEYS_TO_RESTORE) {
      Reflect.deleteProperty(process.env, key)
    }
  }

  beforeEach(() => {
    vi.clearAllMocks()
    clearDiagnosticEnv()
    mockGetAuthContext.mockResolvedValue({
      ctx: { userId: 'user-1', workspaceId: 'ws-1', role: 'owner' },
      error: null,
    })
    mockRequireRole.mockReturnValue(null)
    vi.stubGlobal('fetch', vi.fn())
  })

  afterEach(() => {
    vi.unstubAllGlobals()
    for (const key of ENV_KEYS_TO_RESTORE) {
      const originalValue = originalEnv[key]
      if (originalValue === undefined) {
        Reflect.deleteProperty(process.env, key)
      } else {
        process.env[key as keyof NodeJS.ProcessEnv] = originalValue
      }
    }
  })

  it('owner 以外の GET は 403 を返す', async () => {
    mockRequireRole.mockReturnValueOnce(
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
      expect.objectContaining({
        method: 'POST',
        body: JSON.stringify({
          model: 'gpt-5-mini',
          messages: [{ role: 'user', content: 'hi' }],
          max_completion_tokens: 1,
        }),
      }),
    )
    expect(body.openai.status).toBe('ok')
    expect(body.openai.detail).toBe('クレジット有効・API 正常')
    expect(body.openai.latencyMs).toEqual(expect.any(Number))
  })

  it('GET は Anthropic を呼ばず設定の有無だけを返す', async () => {
    process.env['ANTHROPIC_API_KEY'] = 'sk-ant-test'
    const { GET } = await import('./route')

    const res = await GET()
    const body = await res.json() as { anthropic: { status: string; detail?: string } }

    expect(body.anthropic.status).toBe('ok')
    expect(body.anthropic.detail).toContain('設定済み')
    expect(fetch).not.toHaveBeenCalled()
  })

  it('ANTHROPIC_API_KEY 未設定なら GET も POST も未設定として返し、Anthropic を呼ばない', async () => {
    const { GET, POST } = await import('./route')

    const staticBody = await (await GET()).json() as { anthropic: { status: string } }
    const diagnosticBody = await (await POST()).json() as { anthropic: { status: string } }

    expect(staticBody.anthropic.status).toBe('unconfigured')
    expect(diagnosticBody.anthropic.status).toBe('unconfigured')
    expect(fetch).not.toHaveBeenCalled()
  })

  it('POST の手動診断時だけ Anthropic を呼び、temperature などの既定外パラメータは送らない', async () => {
    process.env['ANTHROPIC_API_KEY'] = 'sk-ant-test'
    vi.mocked(fetch).mockResolvedValueOnce(
      new Response(JSON.stringify({ id: 'msg_test' }), {
        status: 200,
        headers: { 'Content-Type': 'application/json' },
      }),
    )
    const { POST } = await import('./route')

    const res = await POST()
    const body = await res.json() as { anthropic: { status: string; detail?: string } }

    expect(fetch).toHaveBeenCalledTimes(1)
    expect(fetch).toHaveBeenCalledWith(
      'https://api.anthropic.com/v1/messages',
      expect.objectContaining({
        method: 'POST',
        headers: expect.objectContaining({
          'x-api-key': 'sk-ant-test',
          'anthropic-version': '2023-06-01',
        }),
        body: JSON.stringify({
          model: 'claude-haiku-5-5',
          max_tokens: 1,
          messages: [{ role: 'user', content: 'hi' }],
        }),
      }),
    )
    expect(body.anthropic.status).toBe('ok')
  })

  it('Anthropic のクレジット不足は専用の文言で返す', async () => {
    process.env['ANTHROPIC_API_KEY'] = 'sk-ant-test'
    vi.mocked(fetch).mockResolvedValueOnce(
      new Response(
        JSON.stringify({
          error: {
            type: 'invalid_request_error',
            message: 'Your credit balance is too low to access the Anthropic API.',
          },
        }),
        { status: 400, headers: { 'Content-Type': 'application/json' } },
      ),
    )
    const { POST } = await import('./route')

    const res = await POST()
    const body = await res.json() as { anthropic: { status: string; detail?: string } }

    expect(body.anthropic.status).toBe('error')
    expect(body.anthropic.detail).toBe('クレジット残高なし')
  })
})
