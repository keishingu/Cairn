// Copyright 2026 Cairn Contributors
// SPDX-License-Identifier: Apache-2.0

import { Ratelimit } from '@upstash/ratelimit'
import { Redis } from '@upstash/redis'
import { NextResponse } from 'next/server'

type FixedWindowRateLimit = {
  key: string
  limit: number
  windowMs: number
  prefix?: string
}

let redis: InstanceType<typeof Redis> | null = null
let ratelimiters = new Map<string, InstanceType<typeof Ratelimit>>()

function getRedis() {
  if (redis) return redis

  const url = process.env['UPSTASH_REDIS_REST_URL'] ?? process.env['KV_REST_API_URL']
  const token = process.env['UPSTASH_REDIS_REST_TOKEN'] ?? process.env['KV_REST_API_TOKEN']
  if (!url || !token) {
    throw new Error('UPSTASH_REDIS_REST_URL / UPSTASH_REDIS_REST_TOKEN are required')
  }

  redis = new Redis({ url, token })
  return redis
}

function formatWindow(windowMs: number): `${number} ${'s' | 'm' | 'h'}` {
  if (windowMs % (60 * 60 * 1000) === 0) return `${windowMs / (60 * 60 * 1000)} h`
  if (windowMs % (60 * 1000) === 0) return `${windowMs / (60 * 1000)} m`
  return `${Math.ceil(windowMs / 1000)} s`
}

function getLimiter({ limit, windowMs, prefix = '@cairn/request-rate-limit' }: FixedWindowRateLimit) {
  const cacheKey = `${prefix}:${limit}:${windowMs}`
  const cached = ratelimiters.get(cacheKey)
  if (cached) return cached

  const limiter = new Ratelimit({
    redis: getRedis(),
    limiter: Ratelimit.slidingWindow(limit, formatWindow(windowMs)),
    analytics: true,
    prefix,
  })
  ratelimiters.set(cacheKey, limiter)
  return limiter
}

export async function enforceFixedWindowRateLimit(
  { key, limit, windowMs, prefix }: FixedWindowRateLimit,
): Promise<NextResponse | null> {
  let result: Awaited<ReturnType<InstanceType<typeof Ratelimit>['limit']>>
  try {
    result = await getLimiter({ key, limit, windowMs, prefix }).limit(key)
  } catch (error) {
    console.error('[request-rate-limit] shared limiter is unavailable:', error)
    return NextResponse.json({ error: 'Rate limit is unavailable' }, { status: 503 })
  }

  await result.pending
  if (result.success) return null

  return NextResponse.json(
    { error: 'Too many requests' },
    {
      status: 429,
      headers: {
        'Retry-After': String(Math.max(1, Math.ceil((result.reset - Date.now()) / 1000))),
        'X-RateLimit-Limit': String(result.limit),
        'X-RateLimit-Remaining': String(result.remaining),
        'X-RateLimit-Reset': String(result.reset),
      },
    },
  )
}

export function resetRequestRateLimitForTest() {
  redis = null
  ratelimiters = new Map()
}
