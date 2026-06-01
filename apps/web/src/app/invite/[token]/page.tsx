// Copyright 2026 Cairn Contributors
// SPDX-License-Identifier: Apache-2.0

'use client'

import React from 'react'
import Link from 'next/link'
import { useRouter, useParams } from 'next/navigation'
import { QRCodeSVG } from 'qrcode.react'
import { createClient } from '@/lib/supabase/client'

interface InviteInfo {
  workspaceName: string
  createdByName: string
  role: string
  expiresAt: string | null
}

export default function InvitePage() {
  const router = useRouter()
  const { token } = useParams<{ token: string }>()

  const [info, setInfo] = React.useState<InviteInfo | null>(null)
  const [notFound, setNotFound] = React.useState(false)
  const [isLoggedIn, setIsLoggedIn] = React.useState<boolean | null>(null)
  const [joining, setJoining] = React.useState(false)
  const [joinError, setJoinError] = React.useState<string | null>(null)
  const [isMobile, setIsMobile] = React.useState(false)
  const inviteUrl = typeof window !== 'undefined' ? window.location.href : ''

  React.useEffect(() => {
    setIsMobile(window.innerWidth < 768)
  }, [])

  React.useEffect(() => {
    void fetchInviteInfo()
    void checkAuth()
  }, [token])

  async function fetchInviteInfo() {
    const res = await fetch(`/api/invite/${token}`)
    if (!res.ok) {
      setNotFound(true)
      return
    }
    const data = await res.json() as InviteInfo
    setInfo(data)
  }

  async function checkAuth() {
    const supabase = createClient()
    const { data: { user } } = await supabase.auth.getUser()
    setIsLoggedIn(!!user)
  }

  async function handleJoin() {
    setJoining(true)
    setJoinError(null)
    const res = await fetch(`/api/invite/${token}/accept`, { method: 'POST' })
    const data = await res.json().catch(() => ({})) as { ok?: boolean; workspaceId?: string; error?: string }
    if (!res.ok) {
      setJoinError(data.error ?? '参加に失敗しました')
      setJoining(false)
      return
    }
    // 参加したワークスペースをアクティブに設定してフルリロード（キャッシュ破棄）
    if (data.workspaceId) {
      document.cookie = `cairn_workspace_id=${data.workspaceId}; path=/; SameSite=Lax; Max-Age=${60 * 60 * 24 * 365}`
    }
    window.location.href = '/projects'
  }

  if (notFound) {
    return (
      <div style={centeredStyle}>
        <div style={{ width: '100%', maxWidth: 400, textAlign: 'center' }}>
          <div style={logoStyle}>Cairn</div>
          <div style={cardStyle}>
            <div style={{ fontSize: 32, marginBottom: 16 }}>⚠️</div>
            <div style={{ fontSize: 16, fontWeight: 700, color: 'var(--text)', marginBottom: 8 }}>
              招待リンクが無効です
            </div>
            <div style={{ fontSize: 13.5, color: 'var(--text-3)', lineHeight: 1.6 }}>
              このリンクは期限切れか、すでに削除されています。<br />
              招待者に新しいリンクを発行してもらってください。
            </div>
          </div>
        </div>
      </div>
    )
  }

  if (!info || isLoggedIn === null) {
    return (
      <div style={centeredStyle}>
        <div style={{ color: 'var(--text-3)', fontSize: 14 }}>読み込み中...</div>
      </div>
    )
  }

  const roleLabel = info.role === 'guest' ? 'ゲスト' : 'メンバー'
  const expiresLabel = info.expiresAt
    ? `${new Date(info.expiresAt).toLocaleDateString('ja-JP')} まで有効`
    : '無期限'

  return (
    <div style={centeredStyle}>
      <div style={{ width: '100%', maxWidth: 400 }}>
        <div style={{ textAlign: 'center', marginBottom: 32 }}>
          <div style={logoStyle}>Cairn</div>
          <div style={{ fontSize: 14, color: 'var(--text-3)' }}>ワークスペースへの招待</div>
        </div>

        <div style={cardStyle}>
          <div style={{ textAlign: 'center', marginBottom: 20 }}>
            <div style={{ fontSize: 13, color: 'var(--text-3)', marginBottom: 4 }}>
              {info.createdByName} さんが招待しています
            </div>
            <div style={{ fontSize: 22, fontWeight: 800, color: 'var(--text)', marginBottom: 8 }}>
              {info.workspaceName}
            </div>
            <div style={{ display: 'inline-flex', gap: 8, flexWrap: 'wrap', justifyContent: 'center' }}>
              <span style={badgeStyle}>{roleLabel}として参加</span>
              <span style={{ ...badgeStyle, background: 'var(--bg)', color: 'var(--text-3)' }}>{expiresLabel}</span>
            </div>
          </div>

          {isLoggedIn ? (
            <>
              {joinError && (
                <div style={errorStyle}>{joinError}</div>
              )}
              <button
                type="button"
                onClick={handleJoin}
                disabled={joining}
                style={primaryButtonStyle(joining)}
              >
                {joining ? '参加中...' : `「${info.workspaceName}」に参加する`}
              </button>
            </>
          ) : (
            <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
              <Link
                href={`/auth/signup?invite=${token}`}
                style={{ ...primaryButtonStyle(false), textDecoration: 'none', textAlign: 'center', display: 'block' }}
              >
                新規登録して参加
              </Link>
              <Link
                href={`/auth/login?invite=${token}`}
                style={{
                  padding: '10px 16px',
                  borderRadius: 8,
                  border: '1px solid var(--border-2)',
                  background: 'transparent',
                  color: 'var(--text-2)',
                  fontSize: 14,
                  fontWeight: 600,
                  textDecoration: 'none',
                  textAlign: 'center',
                  display: 'block',
                  fontFamily: 'inherit',
                }}
              >
                ログインして参加
              </Link>
            </div>
          )}
        </div>

        {/* モバイルはQRコード表示 */}
        {isMobile && inviteUrl && (
          <div style={{ marginTop: 24, display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 8 }}>
            <div style={{ fontSize: 12.5, color: 'var(--text-3)' }}>このQRコードを共有することもできます</div>
            <div style={{ padding: 12, background: '#fff', borderRadius: 12, border: '1px solid var(--border)' }}>
              <QRCodeSVG value={inviteUrl} size={140} />
            </div>
          </div>
        )}
      </div>
    </div>
  )
}

const centeredStyle: React.CSSProperties = {
  minHeight: '100vh',
  display: 'flex',
  alignItems: 'center',
  justifyContent: 'center',
  background: 'var(--bg)',
  padding: '24px 16px',
}

const logoStyle: React.CSSProperties = {
  fontSize: 28,
  fontWeight: 800,
  color: 'var(--text)',
  letterSpacing: '-0.02em',
  marginBottom: 8,
}

const cardStyle: React.CSSProperties = {
  background: 'var(--card)',
  border: '1px solid var(--border)',
  borderRadius: 16,
  padding: '28px 28px 24px',
  boxShadow: 'var(--shadow-sm)',
  display: 'flex',
  flexDirection: 'column',
  gap: 16,
}

const badgeStyle: React.CSSProperties = {
  display: 'inline-block',
  padding: '3px 10px',
  borderRadius: 20,
  fontSize: 12,
  fontWeight: 600,
  background: 'color-mix(in srgb, var(--accent) 12%, transparent)',
  color: 'var(--accent)',
}

const errorStyle: React.CSSProperties = {
  padding: '8px 12px',
  borderRadius: 8,
  background: 'var(--red-soft)',
  border: '1px solid var(--red)',
  color: 'var(--red-text)',
  fontSize: 12.5,
}

function primaryButtonStyle(disabled: boolean): React.CSSProperties {
  return {
    padding: '10px 16px',
    borderRadius: 8,
    border: 'none',
    background: disabled ? 'var(--border-2)' : 'var(--accent)',
    color: disabled ? 'var(--text-4)' : 'var(--on-accent)',
    fontSize: 14,
    fontWeight: 600,
    cursor: disabled ? 'default' : 'pointer',
    fontFamily: 'inherit',
  }
}
