// Copyright 2026 Cairn Contributors
// SPDX-License-Identifier: Apache-2.0

'use client'

import React from 'react'
import Link from 'next/link'
import { useRouter, useSearchParams } from 'next/navigation'
import { createClient } from '@/lib/supabase/client'

export default function SignupPage() {
  return (
    <React.Suspense fallback={null}>
      <SignupForm />
    </React.Suspense>
  )
}

function SignupForm() {
  const router = useRouter()
  const searchParams = useSearchParams()
  const inviteToken = searchParams.get('invite')
  const [displayName, setDisplayName] = React.useState('')
  const [email, setEmail] = React.useState('')
  const [password, setPassword] = React.useState('')
  const [error, setError] = React.useState<string | null>(null)
  const [loading, setLoading] = React.useState(false)

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault()
    if (password.length < 8) {
      setError('パスワードは8文字以上で入力してください')
      return
    }
    setLoading(true)
    setError(null)

    const supabase = createClient()
    const callbackUrl = inviteToken
      ? `${window.location.origin}/api/auth/callback?invite=${inviteToken}`
      : `${window.location.origin}/api/auth/callback`

    const { data, error: authError } = await supabase.auth.signUp({
      email,
      password,
      options: {
        emailRedirectTo: callbackUrl,
        data: { display_name: displayName },
      },
    })

    if (authError) {
      setError(authError.message)
      setLoading(false)
      return
    }

    // セッションがない = メール確認待ち（data.user が null のケースも含む。
    // Supabase は登録済みメールへの再送時も同じ挙動をとる）
    if (!data.session) {
      router.push('/auth/verify-email')
      return
    }

    await fetch('/api/auth/setup', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ displayName }),
    })

    if (inviteToken) {
      router.push(`/invite/${inviteToken}`)
    } else {
      router.push('/onboarding')
    }
    router.refresh()
  }

  return (
    <div style={{ width: '100%', maxWidth: 400 }}>
      <div style={{ textAlign: 'center', marginBottom: 32 }}>
        <div style={{ fontSize: 28, fontWeight: 800, color: 'var(--text)', letterSpacing: '-0.02em', marginBottom: 8 }}>
          Cairn
        </div>
        <div style={{ fontSize: 14, color: 'var(--text-3)' }}>
          {inviteToken ? 'アカウントを作成して参加' : '新しいワークスペースを作成'}
        </div>
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
              表示名
            </label>
            <input
              type="text"
              value={displayName}
              onChange={e => setDisplayName(e.target.value)}
              required
              autoComplete="name"
              placeholder="山田 太郎"
              style={{
                padding: '9px 12px',
                border: '1px solid var(--border-2)',
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
                border: '1px solid var(--border-2)',
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
              autoComplete="new-password"
              placeholder="8文字以上"
              style={{
                padding: '9px 12px',
                border: '1px solid var(--border-2)',
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
            {loading ? '作成中...' : inviteToken ? 'アカウントを作成して参加' : 'アカウントを作成'}
          </button>
        </form>
      </div>

      <div style={{ textAlign: 'center', marginTop: 20, fontSize: 13, color: 'var(--text-3)' }}>
        すでにアカウントをお持ちの方は{' '}
        <Link
          href={inviteToken ? `/auth/login?invite=${inviteToken}` : '/auth/login'}
          style={{ color: 'var(--accent)', fontWeight: 600, textDecoration: 'none' }}
        >
          サインイン
        </Link>
      </div>
    </div>
  )
}

