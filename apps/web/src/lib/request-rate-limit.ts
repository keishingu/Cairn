// Copyright 2026 Cairn Contributors
// SPDX-License-Identifier: Apache-2.0

import { NextResponse } from 'next/server'

type FixedWindowRateLimit = {
  key: string
  limit: number
  windowMs: number
}

type Counter = {
  count: number
  resetAt: number
}

const counters = new Map<string, Counter>()

export function enforceFixedWindowRateLimit({ key, limit, windowMs }: FixedWindowRateLimit): NextResponse | null {
  const now = Date.now()
  const current = counters.get(key)

  if (!current || current.resetAt <= now) {
    counters.set(key, { count: 1, resetAt: now + windowMs })
    return null
  }

  if (current.count >= limit) {
    const retryAfterSeconds = Math.max(1, Math.ceil((current.resetAt - now) / 1000))
    return NextResponse.json(
      { error: 'Too many requests' },
      {
        status: 429,
        headers: {
          'Retry-After': String(retryAfterSeconds),
        },
      },
    )
  }

  current.count += 1
  counters.set(key, current)
  return null
}

export function resetRequestRateLimitForTest() {
  counters.clear()
}
