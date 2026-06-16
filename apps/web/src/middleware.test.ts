// Copyright 2026 Cairn Contributors
// SPDX-License-Identifier: Apache-2.0

import { NextRequest } from 'next/server'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

// Supabase クライアントは getUser() の戻り値だけ差し替えられればよい
let currentUser: { id: string } | null = null
vi.mock('@supabase/ssr', () => ({
  createServerClient: () => ({
    auth: { getUser: async () => ({ data: { user: currentUser } }) },
  }),
}))

import { middleware } from './middleware'

function request(path: string): NextRequest {
  return new NextRequest(new URL(path, 'http://localhost'))
}

beforeEach(() => {
  vi.stubEnv('NEXT_PUBLIC_SUPABASE_URL', 'http://localhost:54321')
  vi.stubEnv('NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY', 'test-key')
})

afterEach(() => {
  currentUser = null
  vi.unstubAllEnvs()
})

describe('middleware のルーティング', () => {
  it('未認証ユーザーはトップ（/）の LP を通過できる', async () => {
    currentUser = null
    const res = await middleware(request('/'))
    expect(res.headers.get('location')).toBeNull()
  })

  it('認証済みユーザーがトップ（/）に来たら /projects へ送る', async () => {
    currentUser = { id: 'u1' }
    const res = await middleware(request('/'))
    expect(res.headers.get('location')).toBe('http://localhost/projects')
  })

  it('未認証ユーザーが保護ルートに来たら /auth/login へ送る', async () => {
    currentUser = null
    const res = await middleware(request('/projects'))
    expect(res.headers.get('location')).toBe('http://localhost/auth/login')
  })

  it('旧 LP の入口 /lp はトップ（/）へ 308 リダイレクトして集約する', async () => {
    currentUser = null
    const res = await middleware(request('/lp'))
    expect(res.status).toBe(308)
    expect(res.headers.get('location')).toBe('http://localhost/')
  })

  it('LP の資産（/lp/*.css）はリダイレクトせず通過させる', async () => {
    currentUser = null
    const res = await middleware(request('/lp/cairn-lp.css'))
    expect(res.headers.get('location')).toBeNull()
  })
})
