// Copyright 2026 Cairn Contributors
// SPDX-License-Identifier: Apache-2.0

'use client'

import React from 'react'
import { useSearchParams } from 'next/navigation'
import type { UserIdentity } from '@supabase/supabase-js'
import { ConfirmDialog } from './confirm-dialog'
import {
  findIdentity,
  providerLabel,
  useAuthIdentities,
  useLinkAppleIdentity,
  useUnlinkAppleIdentity,
} from '@/hooks/use-auth-identities'

const APPLE_IDENTITY_LINKED_EVENT = 'cairn:apple-identity-linked'

type NativeAppleLinkDetail = {
  ok?: boolean
  cancelled?: boolean
  message?: string
}

function hasReactNativeWebView(): boolean {
  return Boolean(
    (window as typeof window & { ReactNativeWebView?: { postMessage: (message: string) => void } })
      .ReactNativeWebView,
  )
}

function isExpoIosWebView(): boolean {
  return hasReactNativeWebView() && /iPhone|iPad|iPod/i.test(navigator.userAgent)
}

function isExpoAndroidWebView(): boolean {
  return hasReactNativeWebView() && /Android/i.test(navigator.userAgent)
}

function requestNativeAppleLink(): Promise<NativeAppleLinkDetail> {
  return new Promise((resolve) => {
    const nativeBridge = (
      window as typeof window & {
        ReactNativeWebView?: { postMessage: (message: string) => void }
      }
    ).ReactNativeWebView

    if (!nativeBridge) {
      resolve({ ok: false, message: 'ネイティブ連携を開始できませんでした' })
      return
    }

    const timeout = window.setTimeout(() => {
      window.removeEventListener(APPLE_IDENTITY_LINKED_EVENT, onResult as EventListener)
      resolve({
        ok: false,
        message: 'Apple 連携がタイムアウトしました。もう一度お試しください。',
      })
    }, 120_000)

    function onResult(event: Event) {
      window.clearTimeout(timeout)
      window.removeEventListener(APPLE_IDENTITY_LINKED_EVENT, onResult as EventListener)
      const detail = (event as CustomEvent<NativeAppleLinkDetail>).detail ?? {}
      resolve(detail)
    }

    window.addEventListener(APPLE_IDENTITY_LINKED_EVENT, onResult as EventListener)
    nativeBridge.postMessage(JSON.stringify({ type: 'link-apple-identity' }))
  })
}

function IdentityRow({
  identity,
  action,
}: {
  identity: UserIdentity
  action?: React.ReactNode
}) {
  return (
    <div
      style={{
        display: 'flex',
        alignItems: 'center',
        gap: 16,
        padding: '14px 16px',
        borderBottom: '1px solid var(--divider)',
      }}
    >
      <div style={{ flex: 1, minWidth: 0 }}>
        <div style={{ fontSize: 13, fontWeight: 600 }}>{providerLabel(identity.provider)}</div>
        <div style={{ fontSize: 11.5, color: 'var(--text-3)', marginTop: 2 }}>
          {identity.identity_data?.['email']
            ? String(identity.identity_data['email'])
            : '連携済み'}
        </div>
      </div>
      {action}
    </div>
  )
}

export function LoginMethodsSettings() {
  const searchParams = useSearchParams()
  const { data: identities, isLoading, isError, error, refetch } = useAuthIdentities()
  const linkApple = useLinkAppleIdentity()
  const unlinkApple = useUnlinkAppleIdentity()

  const [message, setMessage] = React.useState<{ text: string; ok: boolean } | null>(null)
  const [unlinkOpen, setUnlinkOpen] = React.useState(false)
  const [linking, setLinking] = React.useState(false)

  const appleIdentity = findIdentity(identities, 'apple')
  const canUnlinkApple = Boolean(appleIdentity && (identities?.length ?? 0) >= 2)
  const showAndroidAppleHint = isExpoAndroidWebView() && !appleIdentity

  React.useEffect(() => {
    if (searchParams.get('loginLinked') !== '1') return
    setMessage({ text: 'Apple をログイン方法として連携しました', ok: true })
    const url = new URL(window.location.href)
    url.searchParams.delete('loginLinked')
    window.history.replaceState({}, '', `${url.pathname}${url.search}${url.hash}`)
    void refetch()
    const timer = window.setTimeout(() => setMessage(null), 5000)
    return () => window.clearTimeout(timer)
  }, [searchParams, refetch])

  const handleLinkApple = async () => {
    setMessage(null)
    setLinking(true)
    try {
      if (isExpoIosWebView()) {
        const result = await requestNativeAppleLink()
        if (result.cancelled) {
          setMessage({ text: 'Apple 連携をキャンセルしました', ok: false })
          return
        }
        if (!result.ok) {
          setMessage({
            text: result.message ?? 'Apple との連携に失敗しました',
            ok: false,
          })
          return
        }
        setMessage({ text: 'Apple をログイン方法として連携しました', ok: true })
        void refetch()
        return
      }

      await linkApple.mutateAsync()
    } catch (err) {
      setMessage({
        text: err instanceof Error ? err.message : 'Apple との連携に失敗しました',
        ok: false,
      })
    } finally {
      setLinking(false)
    }
  }

  const handleUnlinkApple = async () => {
    if (!appleIdentity) return
    await unlinkApple.mutateAsync(appleIdentity)
    setUnlinkOpen(false)
    setMessage({ text: 'Apple 連携を解除しました', ok: true })
  }

  return (
    <section style={{ marginBottom: 24 }}>
      <h2 style={{ margin: '0 0 10px', fontSize: 14, fontWeight: 700 }}>ログイン方法</h2>
      <p style={{ margin: '0 0 10px', color: 'var(--text-3)', fontSize: 12.5, lineHeight: 1.5 }}>
        同じアカウントに複数のログイン方法を追加できます。Apple の「メールを非公開」を使っても、ここで明示的に連携できます。
      </p>
      <div className="card" style={{ padding: 0 }}>
        {isLoading ? (
          <div style={{ padding: 16, fontSize: 13, color: 'var(--text-3)' }}>読み込み中…</div>
        ) : isError ? (
          <div style={{ padding: 16, fontSize: 12, color: 'var(--red-text)' }}>
            ⚠ {(error as Error).message}
          </div>
        ) : (
          <>
            {(identities ?? []).map((identity) => (
              <IdentityRow
                key={identity.identity_id}
                identity={identity}
                action={
                  identity.provider === 'apple' ? (
                    <button
                      type="button"
                      className="btn btn-ghost"
                      style={{ height: 30, fontSize: 12, padding: '0 12px' }}
                      disabled={!canUnlinkApple || unlinkApple.isPending}
                      onClick={() => setUnlinkOpen(true)}
                    >
                      解除
                    </button>
                  ) : undefined
                }
              />
            ))}

            {!appleIdentity && !showAndroidAppleHint && (
              <div
                style={{
                  display: 'flex',
                  alignItems: 'center',
                  gap: 16,
                  padding: '14px 16px',
                }}
              >
                <div style={{ flex: 1, minWidth: 0 }}>
                  <div style={{ fontSize: 13, fontWeight: 600 }}>Apple</div>
                  <div style={{ fontSize: 11.5, color: 'var(--text-3)', marginTop: 2 }}>
                    未連携。連携すると次回から Apple でも同じアカウントに入れます。
                  </div>
                </div>
                <button
                  type="button"
                  className="btn btn-ghost"
                  style={{ height: 30, fontSize: 12, padding: '0 12px', flexShrink: 0 }}
                  disabled={linking || linkApple.isPending}
                  onClick={() => void handleLinkApple()}
                >
                  {linking || linkApple.isPending ? '連携中…' : 'Apple を連携'}
                </button>
              </div>
            )}

            {showAndroidAppleHint && (
              <div style={{ padding: '14px 16px', fontSize: 12, color: 'var(--text-3)' }}>
                Android アプリでは Apple ログインを提供していないため、ここでは連携できません。Web
                または iOS から連携してください。
              </div>
            )}
          </>
        )}

        {message && (
          <div
            role="status"
            style={{
              padding: '8px 16px 12px',
              fontSize: 12,
              color: message.ok ? 'var(--text-2)' : 'var(--red-text)',
            }}
          >
            {message.ok ? message.text : `⚠ ${message.text}`}
          </div>
        )}

        {unlinkApple.isError && (
          <div style={{ padding: '0 16px 12px', fontSize: 12, color: 'var(--red-text)' }}>
            ⚠ {(unlinkApple.error as Error).message}
          </div>
        )}
      </div>

      <ConfirmDialog
        open={unlinkOpen}
        title="Apple 連携を解除しますか？"
        confirmLabel="解除する"
        busyLabel="解除中…"
        onClose={() => setUnlinkOpen(false)}
        onConfirm={handleUnlinkApple}
        message="解除すると、このアカウントでは Apple でサインインできなくなります。メールなど別のログイン方法は残ります。"
      />
    </section>
  )
}
