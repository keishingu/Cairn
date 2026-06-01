// Copyright 2026 Cairn Contributors
// SPDX-License-Identifier: Apache-2.0

'use client'

import React from 'react'
import { useRouter } from 'next/navigation'
import { QRCodeSVG } from 'qrcode.react'

type ExpiresIn = '1h' | '30d' | 'never'

const EXPIRES_OPTIONS: { value: ExpiresIn; label: string }[] = [
  { value: '1h', label: '1時間' },
  { value: '30d', label: '30日間' },
  { value: 'never', label: '無期限' },
]

export default function OnboardingInvitePage() {
  const router = useRouter()
  const [expiresIn, setExpiresIn] = React.useState<ExpiresIn>('1h')
  const [inviteUrl, setInviteUrl] = React.useState<string | null>(null)
  const [generating, setGenerating] = React.useState(false)
  const [copied, setCopied] = React.useState(false)
  const [isMobile, setIsMobile] = React.useState(false)

  React.useEffect(() => {
    setIsMobile(window.innerWidth < 768)
  }, [])

  async function generateLink() {
    setGenerating(true)
    setCopied(false)
    const res = await fetch('/api/workspaces/invites', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ expiresIn }),
    })
    if (res.ok) {
      const data = await res.json() as { url: string }
      setInviteUrl(data.url)
    }
    setGenerating(false)
  }

  async function copyLink() {
    if (!inviteUrl) return
    await navigator.clipboard.writeText(inviteUrl)
    setCopied(true)
    setTimeout(() => setCopied(false), 2000)
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
          <StepDot label="2" done />
          <StepLine />
          <StepDot label="3" active />
        </div>

        <div style={{ textAlign: 'center', marginBottom: 32 }}>
          <div style={{ fontSize: 28, fontWeight: 800, color: 'var(--text)', letterSpacing: '-0.02em', marginBottom: 8 }}>
            Cairn
          </div>
          <div style={{ fontSize: 18, fontWeight: 700, color: 'var(--text)', marginBottom: 8 }}>
            メンバーを招待
          </div>
          <div style={{ fontSize: 14, color: 'var(--text-3)', lineHeight: 1.6 }}>
            招待リンクを共有してメンバーを追加できます。<br />
            あとからメンバーページでも招待できます。
          </div>
        </div>

        <div style={{
          background: 'var(--card)',
          border: '1px solid var(--border)',
          borderRadius: 16,
          padding: '28px 28px 24px',
          boxShadow: 'var(--shadow-sm)',
          display: 'flex',
          flexDirection: 'column',
          gap: 20,
        }}>
          {/* 有効期限選択 */}
          <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
            <div style={{ fontSize: 12.5, fontWeight: 600, color: 'var(--text-2)' }}>
              リンクの有効期限
            </div>
            <div style={{ display: 'flex', gap: 8 }}>
              {EXPIRES_OPTIONS.map(opt => (
                <button
                  key={opt.value}
                  type="button"
                  onClick={() => { setExpiresIn(opt.value); setInviteUrl(null) }}
                  style={{
                    flex: 1,
                    padding: '7px 0',
                    borderRadius: 8,
                    border: `1.5px solid ${expiresIn === opt.value ? 'var(--accent)' : 'var(--border-2)'}`,
                    background: expiresIn === opt.value ? 'var(--accent-soft, color-mix(in srgb, var(--accent) 12%, transparent))' : 'var(--bg)',
                    color: expiresIn === opt.value ? 'var(--accent)' : 'var(--text-3)',
                    fontSize: 13,
                    fontWeight: expiresIn === opt.value ? 700 : 400,
                    cursor: 'pointer',
                    fontFamily: 'inherit',
                    transition: 'all 0.15s',
                  }}
                >
                  {opt.label}
                </button>
              ))}
            </div>
          </div>

          {/* リンク生成ボタン */}
          {!inviteUrl && (
            <button
              type="button"
              onClick={generateLink}
              disabled={generating}
              style={{
                padding: '10px 16px',
                borderRadius: 8,
                border: 'none',
                background: generating ? 'var(--border-2)' : 'var(--accent)',
                color: generating ? 'var(--text-4)' : 'var(--on-accent)',
                fontSize: 14,
                fontWeight: 600,
                cursor: generating ? 'default' : 'pointer',
                fontFamily: 'inherit',
              }}
            >
              {generating ? '生成中...' : '招待リンクを生成'}
            </button>
          )}

          {/* 生成済みリンク */}
          {inviteUrl && (
            <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
              <div style={{
                display: 'flex',
                gap: 8,
                padding: '8px 10px',
                background: 'var(--bg)',
                border: '1px solid var(--border-2)',
                borderRadius: 8,
                alignItems: 'center',
              }}>
                <div style={{
                  flex: 1,
                  fontSize: 12.5,
                  color: 'var(--text-3)',
                  overflow: 'hidden',
                  textOverflow: 'ellipsis',
                  whiteSpace: 'nowrap',
                }}>
                  {inviteUrl}
                </div>
                <button
                  type="button"
                  onClick={copyLink}
                  style={{
                    flexShrink: 0,
                    padding: '5px 12px',
                    borderRadius: 6,
                    border: 'none',
                    background: copied ? 'var(--green-soft, #e6f7ee)' : 'var(--accent)',
                    color: copied ? 'var(--green-text, #1a7a3c)' : 'var(--on-accent)',
                    fontSize: 12.5,
                    fontWeight: 600,
                    cursor: 'pointer',
                    fontFamily: 'inherit',
                    whiteSpace: 'nowrap',
                    transition: 'all 0.15s',
                  }}
                >
                  {copied ? 'コピー済み ✓' : 'コピー'}
                </button>
              </div>

              {/* モバイルはQRコードも表示 */}
              {isMobile && (
                <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 8, padding: '12px 0' }}>
                  <div style={{ fontSize: 12.5, color: 'var(--text-3)', fontWeight: 500 }}>
                    QRコードでも招待できます
                  </div>
                  <div style={{
                    padding: 12,
                    background: '#fff',
                    borderRadius: 12,
                    border: '1px solid var(--border)',
                  }}>
                    <QRCodeSVG value={inviteUrl} size={160} />
                  </div>
                </div>
              )}

              <button
                type="button"
                onClick={generateLink}
                style={{
                  padding: '6px 0',
                  borderRadius: 8,
                  border: '1px solid var(--border-2)',
                  background: 'transparent',
                  color: 'var(--text-3)',
                  fontSize: 12.5,
                  cursor: 'pointer',
                  fontFamily: 'inherit',
                }}
              >
                別のリンクを生成
              </button>
            </div>
          )}
        </div>

        <button
          type="button"
          onClick={() => router.push('/projects')}
          style={{
            width: '100%',
            marginTop: 16,
            padding: '10px 16px',
            borderRadius: 8,
            border: '1px solid var(--border-2)',
            background: 'transparent',
            color: 'var(--text-3)',
            fontSize: 14,
            fontWeight: 500,
            cursor: 'pointer',
            fontFamily: 'inherit',
          }}
        >
          スキップして始める
        </button>
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
