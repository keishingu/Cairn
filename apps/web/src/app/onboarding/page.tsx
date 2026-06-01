// Copyright 2026 Cairn Contributors
// SPDX-License-Identifier: Apache-2.0

'use client'

import React from 'react'
import { useRouter } from 'next/navigation'

export default function OnboardingPage() {
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

    // 作成したワークスペースをアクティブに設定してフルリロード（キャッシュ破棄）
    if (body.workspaceId) {
      document.cookie = `cairn_workspace_id=${body.workspaceId}; path=/; SameSite=Lax; Max-Age=${60 * 60 * 24 * 365}`
    }

    router.push('/onboarding/invite')
  }

  return (
    <div style={{
      minHeight: '100vh',
      display: 'flex',
      alignItems: 'center',
      justifyContent: 'center',
      background: 'var(--bg)',
      padding: '24px 16px',
    }}>
      <div style={{ width: '100%', maxWidth: 440 }}>
        {/* Step indicator */}
        <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 32, justifyContent: 'center' }}>
          <StepDot label="1" done />
          <StepLine />
          <StepDot label="2" active />
          <StepLine />
          <StepDot label="3" />
        </div>

        <div style={{ textAlign: 'center', marginBottom: 32 }}>
          <div style={{ fontSize: 28, fontWeight: 800, color: 'var(--text)', letterSpacing: '-0.02em', marginBottom: 8 }}>
            Cairn
          </div>
          <div style={{ fontSize: 18, fontWeight: 700, color: 'var(--text)', marginBottom: 8 }}>
            ワークスペースを作成
          </div>
          <div style={{ fontSize: 14, color: 'var(--text-3)', lineHeight: 1.6 }}>
            チームや組織の名前でワークスペースを作成します。<br />
            メンバーはあとから招待できます。
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
                placeholder="例: 山岳部、開発チーム、ABC株式会社"
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
              <div style={{ fontSize: 12, color: 'var(--text-4)' }}>
                あとで変更できます
              </div>
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
              disabled={loading || !workspaceName.trim()}
              style={{
                padding: '10px 16px',
                borderRadius: 8,
                border: 'none',
                background: loading || !workspaceName.trim() ? 'var(--border-2)' : 'var(--accent)',
                color: loading || !workspaceName.trim() ? 'var(--text-4)' : 'var(--on-accent)',
                fontSize: 14,
                fontWeight: 600,
                cursor: loading || !workspaceName.trim() ? 'default' : 'pointer',
                fontFamily: 'inherit',
                marginTop: 4,
              }}
            >
              {loading ? '作成中...' : 'ワークスペースを作成'}
            </button>
          </form>
        </div>
      </div>
    </div>
  )
}

function StepDot({ label, done, active }: { label: string; done?: boolean; active?: boolean }) {
  const bg = done ? 'var(--accent)' : active ? 'var(--accent)' : 'var(--border-2)'
  const color = done || active ? 'var(--on-accent)' : 'var(--text-4)'
  return (
    <div style={{
      width: 28,
      height: 28,
      borderRadius: '50%',
      background: bg,
      color,
      display: 'flex',
      alignItems: 'center',
      justifyContent: 'center',
      fontSize: 12,
      fontWeight: 700,
      flexShrink: 0,
    }}>
      {done ? '✓' : label}
    </div>
  )
}

function StepLine() {
  return <div style={{ flex: 1, height: 1, background: 'var(--border-2)', maxWidth: 48 }} />
}
