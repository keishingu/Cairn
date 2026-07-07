// Copyright 2026 Cairn Contributors
// SPDX-License-Identifier: Apache-2.0

import { Ratelimit } from '@upstash/ratelimit'
import { Redis } from '@upstash/redis'
import { type NextFetchEvent, type NextRequest, NextResponse } from 'next/server'

const RATE_LIMIT_POLICIES = {
  '/api/auth/webview-handoff': {
    bucket: 'webview-handoff',
    limit: 5,
    window: '10 m',
  },
  '/api/workspaces/invites': {
    bucket: 'workspace-invites',
    limit: 10,
    window: '1 h',
  },
} as const

type RateLimitPath = keyof typeof RATE_LIMIT_POLICIES

let ratelimiters:
  | Partial<Record<RateLimitPath, InstanceType<typeof Ratelimit>>>
  | null = null

function getFirstConfiguredEnv(...keys: string[]): string | null {
  for (const key of keys) {
    const value = process.env[key]?.trim()
    if (value) return value
  }

  return null
}

function resolveClientIp(request: NextRequest): string | null {
  const forwardedFor = request.headers.get('x-forwarded-for')
  if (forwardedFor) {
    const [firstIp] = forwardedFor.split(',')
    const ip = firstIp?.trim()
    if (ip) return ip
  }

  const realIp = request.headers.get('x-real-ip')?.trim()
  return realIp || null
}

function getRateLimiters() {
  if (ratelimiters) return ratelimiters

  const redisUrl = getFirstConfiguredEnv('UPSTASH_REDIS_REST_URL', 'KV_REST_API_URL')
  const redisToken = getFirstConfiguredEnv('UPSTASH_REDIS_REST_TOKEN', 'KV_REST_API_TOKEN')

  if (!redisUrl || !redisToken) {
    throw new Error('UPSTASH_REDIS_REST_URL / UPSTASH_REDIS_REST_TOKEN are required')
  }

  const redis = new Redis({ url: redisUrl, token: redisToken })

  ratelimiters = {
    '/api/auth/webview-handoff': new Ratelimit({
      redis,
      limiter: Ratelimit.slidingWindow(
        RATE_LIMIT_POLICIES['/api/auth/webview-handoff'].limit,
        RATE_LIMIT_POLICIES['/api/auth/webview-handoff'].window,
      ),
      analytics: true,
      prefix: '@cairn/webview-handoff',
    }),
    '/api/workspaces/invites': new Ratelimit({
      redis,
      limiter: Ratelimit.slidingWindow(
        RATE_LIMIT_POLICIES['/api/workspaces/invites'].limit,
        RATE_LIMIT_POLICIES['/api/workspaces/invites'].window,
      ),
      analytics: true,
      prefix: '@cairn/workspace-invites',
    }),
  }

  return ratelimiters
}

export function isRateLimitedPath(pathname: string): pathname is RateLimitPath {
  return pathname in RATE_LIMIT_POLICIES
}

export async function enforceRateLimit(
  request: NextRequest,
  event?: Pick<NextFetchEvent, 'waitUntil'>,
): Promise<NextResponse | null> {
  const { pathname } = request.nextUrl
  if (!isRateLimitedPath(pathname) || request.method !== 'POST') return null

  const policy = RATE_LIMIT_POLICIES[pathname]
  const identifier = resolveClientIp(request)

  if (!identifier) {
    return NextResponse.json(
      { error: 'Unable to determine client IP for rate limiting' },
      { status: 400 },
    )
  }

  let limiter: InstanceType<typeof Ratelimit>
  try {
    limiter = getRateLimiters()[pathname]!
  } catch (error) {
    console.error('[rate-limit] Redis configuration is missing:', error)
    return NextResponse.json({ error: 'Rate limit is unavailable' }, { status: 503 })
  }

  const result = await limiter.limit(`${policy.bucket}:${identifier}`)
  if (event) {
    event.waitUntil(result.pending)
  } else {
    void result.pending
  }

  if (result.success) {
    return null
  }

  return NextResponse.json(
    { error: 'Too many requests' },
    {
      status: 429,
      headers: {
        'Retry-After': String(Math.max(0, Math.ceil((result.reset - Date.now()) / 1000))),
        'X-RateLimit-Limit': String(result.limit),
        'X-RateLimit-Remaining': String(result.remaining),
        'X-RateLimit-Reset': String(result.reset),
      },
    },
  )
}
