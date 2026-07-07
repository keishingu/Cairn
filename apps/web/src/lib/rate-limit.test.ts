import { NextRequest } from 'next/server'
import { beforeEach, describe, expect, it, vi } from 'vitest'

const limitMock = vi.fn()
const slidingWindowMock = vi.fn()
const redisCtorMock = vi.fn()
const waitUntilMock = vi.fn()
const consoleErrorSpy = vi.spyOn(console, 'error').mockImplementation(() => {})

vi.mock('@upstash/ratelimit', () => ({
  Ratelimit: class {
    static slidingWindow = slidingWindowMock

    constructor() {}

    limit = limitMock
  },
}))

vi.mock('@upstash/redis', () => ({
  Redis: class {
    constructor(config: unknown) {
      redisCtorMock(config)
    }
  },
}))

function makeRequest(pathname: string, init?: RequestInit): NextRequest {
  return new NextRequest(
    new URL(pathname, 'http://localhost:3000'),
    init as ConstructorParameters<typeof NextRequest>[1],
  )
}

describe('rate-limit', () => {
  beforeEach(() => {
    vi.resetModules()
    limitMock.mockReset()
    slidingWindowMock.mockReset()
    redisCtorMock.mockReset()
    waitUntilMock.mockReset()
    consoleErrorSpy.mockClear()
    process.env['UPSTASH_REDIS_REST_URL'] = 'https://redis.example.com'
    process.env['UPSTASH_REDIS_REST_TOKEN'] = 'token'
    delete process.env['KV_REST_API_URL']
    delete process.env['KV_REST_API_TOKEN']
    limitMock.mockResolvedValue({
      success: true,
      limit: 10,
      remaining: 9,
      reset: Date.now() + 60_000,
      pending: Promise.resolve(),
    })
  })

  it('末尾スラッシュ付きの対象 API も rate limit 判定する', async () => {
    const { enforceRateLimit } = await import('./rate-limit')
    const res = await enforceRateLimit(
      makeRequest('/api/workspaces/invites/', {
        method: 'POST',
        headers: { 'x-forwarded-for': '203.0.113.23' },
      }),
      { waitUntil: waitUntilMock },
    )

    expect(res).toBeNull()
    expect(limitMock).toHaveBeenCalledWith('workspace-invites:203.0.113.23')
    expect(waitUntilMock).toHaveBeenCalledTimes(1)
  })

  it('project guest invite API も workspace invite と同じ制限を使う', async () => {
    const { enforceRateLimit } = await import('./rate-limit')
    const res = await enforceRateLimit(
      makeRequest('/api/projects/project-1/guest-invite', {
        method: 'POST',
        headers: { 'x-forwarded-for': '203.0.113.26' },
      }),
      { waitUntil: waitUntilMock },
    )

    expect(res).toBeNull()
    expect(limitMock).toHaveBeenCalledWith('workspace-invites:203.0.113.26')
    expect(waitUntilMock).toHaveBeenCalledTimes(1)
  })

  it('末尾スラッシュ付きでも上限超過なら 429 を返す', async () => {
    limitMock.mockResolvedValue({
      success: false,
      limit: 10,
      remaining: 0,
      reset: Date.now() + 30_000,
      pending: Promise.resolve(),
    })

    const { enforceRateLimit } = await import('./rate-limit')
    const res = await enforceRateLimit(
      makeRequest('/api/auth/webview-handoff/', {
        method: 'POST',
        headers: { 'x-forwarded-for': '203.0.113.24' },
      }),
      { waitUntil: waitUntilMock },
    )

    expect(res?.status).toBe(429)
    await expect(res?.json()).resolves.toEqual({ error: 'Too many requests' })
  })

  it('Upstash が片方だけ設定されていても KV の組み合わせへフォールバックする', async () => {
    process.env['UPSTASH_REDIS_REST_URL'] = 'https://upstash.example.com'
    delete process.env['UPSTASH_REDIS_REST_TOKEN']
    process.env['KV_REST_API_URL'] = 'https://kv.example.com'
    process.env['KV_REST_API_TOKEN'] = 'kv-token'

    const { enforceRateLimit } = await import('./rate-limit')
    const res = await enforceRateLimit(
      makeRequest('/api/workspaces/invites', {
        method: 'POST',
        headers: { 'x-forwarded-for': '203.0.113.25' },
      }),
      { waitUntil: waitUntilMock },
    )

    expect(res).toBeNull()
    expect(redisCtorMock).toHaveBeenCalledWith({
      url: 'https://kv.example.com',
      token: 'kv-token',
    })
  })

  it('Upstash timeout は 503 で fail-closed する', async () => {
    limitMock.mockResolvedValue({
      success: true,
      reason: 'timeout',
      limit: 10,
      remaining: 9,
      reset: Date.now() + 60_000,
      pending: Promise.resolve(),
    })

    const { enforceRateLimit } = await import('./rate-limit')
    const res = await enforceRateLimit(
      makeRequest('/api/auth/webview-handoff', {
        method: 'POST',
        headers: { 'x-forwarded-for': '203.0.113.27' },
      }),
      { waitUntil: waitUntilMock },
    )

    expect(res?.status).toBe(503)
    await expect(res?.json()).resolves.toEqual({ error: 'Rate limit is unavailable' })
    expect(waitUntilMock).toHaveBeenCalledTimes(1)
    expect(consoleErrorSpy).toHaveBeenCalledWith('[rate-limit] Redis request timed out')
  })
})
