// Copyright 2026 Cairn Contributors
// SPDX-License-Identifier: Apache-2.0

'use client'

import React from 'react'
import Link from 'next/link'
import { useRouter } from 'next/navigation'
import { createClient } from '@/lib/supabase/client'

export default function LoginPage() {
  const router = useRouter()
  const [email, setEmail] = React.useState('')
  const [password, setPassword] = React.useState('')
  const [error, setError] = React.useState<string | null>(null)
  const [loading, setLoading] = React.useState(false)

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault()
    setLoading(true)
    setError(null)

    const supabase = createClient()
    const { data, error: authError } = await supabase.auth.signInWithPassword({ email, password })

    if (authError) {
      setError('メールアドレスまたはパスワードが正しくありません')
      setLoading(false)
      return
    }

    // コールバック失敗等でセットアップが未完了のユーザーを救済するため、
    // ログイン時に毎回 setup を呼ぶ（冪等なので既存ユーザーには影響なし）
    const displayName =
      (data.user?.user_metadata?.['display_name'] as string | undefined) ??
      data.user?.email ??
      'ユーザー'
    await fetch('/api/auth/setup', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ displayName }),
    })

    router.push('/projects')
    router.refresh()
  }

  return (
    <div style={{ width: '100%', maxWidth: 400 }}>
      <div style={{ textAlign: 'center', marginBottom: 32 }}>
        <div style={{ fontSize: 28, fontWeight: 800, color: 'var(--text)', letterSpacing: '-0.02em', marginBottom: 8 }}>
          Cairn
        </div>
        <div style={{ fontSize: 14, color: 'var(--text-3)' }}>アカウントにサインイン</div>
      </div>

      <div style={{
        background: 'var(--card)',
        border: '1px solid var(--border)',
        borderRadius: 16,
        padding: '28px 28px 24px',
        boxShadow: 'var(--shadow-sm)',
      }}>
        <form onSubmit={handleSubmit} style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
          <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
            <label style={{ fontSize: 12.5, fontWeight: 600, color: 'var(--text-2)' }}>
              メールアドレス
            </label>
            <input
              type="email"
              value={email}
              onChange={e => setEmail(e.target.value)}
              required
              autoComplete="email"
              placeholder="you@example.com"
              style={{
                padding: '9px 12px',
                border: `1px solid ${error ? 'var(--red)' : 'var(--border-2)'}`,
                borderRadius: 8,
                fontSize: 14,
                color: 'var(--text)',
                background: 'var(--bg)',
                outline: 'none',
                fontFamily: 'inherit',
              }}
            />
          </div>

          <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
            <label style={{ fontSize: 12.5, fontWeight: 600, color: 'var(--text-2)' }}>
              パスワード
            </label>
            <input
              type="password"
              value={password}
              onChange={e => setPassword(e.target.value)}
              required
              autoComplete="current-password"
              placeholder="••••••••"
              style={{
                padding: '9px 12px',
                border: `1px solid ${error ? 'var(--red)' : 'var(--border-2)'}`,
                borderRadius: 8,
                fontSize: 14,
                color: 'var(--text)',
                background: 'var(--bg)',
                outline: 'none',
                fontFamily: 'inherit',
              }}
            />
          </div>

          {error && (
            <div style={{
              padding: '8px 12px',
              borderRadius: 8,
              background: 'var(--red-soft)',
              border: '1px solid var(--red)',
              color: 'var(--red-text)',
              fontSize: 12.5,
            }}>
              {error}
            </div>
          )}

          <button
            type="submit"
            disabled={loading}
            style={{
              padding: '10px 16px',
              borderRadius: 8,
              border: 'none',
              background: loading ? 'var(--border-2)' : 'var(--accent)',
              color: loading ? 'var(--text-4)' : 'var(--on-accent)',
              fontSize: 14,
              fontWeight: 600,
              cursor: loading ? 'default' : 'pointer',
              fontFamily: 'inherit',
              marginTop: 4,
            }}
          >
            {loading ? 'サインイン中...' : 'サインイン'}
          </button>
        </form>
      </div>

      <div style={{ textAlign: 'center', marginTop: 20, fontSize: 13, color: 'var(--text-3)' }}>
        アカウントをお持ちでない方は{' '}
        <Link href="/auth/signup" style={{ color: 'var(--accent)', fontWeight: 600, textDecoration: 'none' }}>
          新規登録
        </Link>
      </div>
    </div>
  )
}
