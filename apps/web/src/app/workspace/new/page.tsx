// Copyright 2026 Cairn Contributors
// SPDX-License-Identifier: Apache-2.0

'use client'

import React from 'react'
import { useRouter } from 'next/navigation'
import { WORKSPACE_COOKIE } from '@/lib/workspace-cookie'

export default function NewWorkspacePage() {
  const router = useRouter()
  const [workspaceName, setWorkspaceName] = React.useState('')
  const [error, setError] = React.useState<string | null>(null)
  const [loading, setLoading] = React.useState(false)

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault()
    if (!workspaceName.trim()) return
    setLoading(true)
    setError(null)

    const res = await fetch('/api/auth/setup', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ workspaceName: workspaceName.trim() }),
    })

    const body = await res.json().catch(() => ({})) as { ok?: boolean; workspaceId?: string; error?: string }

    if (!res.ok) {
      setError(body.error ?? 'ワークスペースの作成に失敗しました')
      setLoading(false)
      return
    }

    if (body.workspaceId) {
      document.cookie = `${WORKSPACE_COOKIE}=${body.workspaceId}; path=/; SameSite=Lax; Max-Age=${60 * 60 * 24 * 365}`
    }
    router.push('/projects')
    router.refresh()
  }

  return (
    <div className="app app-root" style={{
      minHeight: '100vh',
      display: 'flex',
      alignItems: 'center',
      justifyContent: 'center',
      background: 'var(--bg)',
      padding: '24px 16px',
    }}>
      <div style={{ width: '100%', maxWidth: 440 }}>
        <div style={{ textAlign: 'center', marginBottom: 32 }}>
          <div style={{ fontSize: 28, fontWeight: 800, color: 'var(--text)', letterSpacing: '-0.02em', marginBottom: 8 }}>
            Cairn
          </div>
          <div style={{ fontSize: 18, fontWeight: 700, color: 'var(--text)', marginBottom: 8 }}>
            新しいワークスペースを作成
          </div>
          <div style={{ fontSize: 14, color: 'var(--text-3)' }}>
            別のチームや用途向けに新しいワークスペースを作成します。
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
                ワークスペース名
              </label>
              <input
                type="text"
                value={workspaceName}
                onChange={e => setWorkspaceName(e.target.value)}
                required
                autoFocus
                placeholder="例: 開発チーム、ABC株式会社"
                maxLength={100}
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
                padding: '8px 12px', borderRadius: 8,
                background: 'var(--red-soft)', border: '1px solid var(--red)',
                color: 'var(--red-text)', fontSize: 12.5,
              }}>
                {error}
              </div>
            )}

            <button
              type="submit"
              disabled={loading || !workspaceName.trim()}
              style={{
                padding: '10px 16px', borderRadius: 8, border: 'none',
                background: loading || !workspaceName.trim() ? 'var(--border-2)' : 'var(--accent)',
                color: loading || !workspaceName.trim() ? 'var(--text-4)' : 'var(--on-accent)',
                fontSize: 14, fontWeight: 600,
                cursor: loading || !workspaceName.trim() ? 'default' : 'pointer',
                fontFamily: 'inherit', marginTop: 4,
              }}
            >
              {loading ? '作成中...' : '作成'}
            </button>
          </form>
        </div>

        <button
          type="button"
          onClick={() => router.back()}
          style={{
            width: '100%', marginTop: 16, padding: '10px 16px', borderRadius: 8,
            border: '1px solid var(--border-2)', background: 'transparent',
            color: 'var(--text-3)', fontSize: 14, fontWeight: 500,
            cursor: 'pointer', fontFamily: 'inherit',
          }}
        >
          キャンセル
        </button>
      </div>
    </div>
  )
}
