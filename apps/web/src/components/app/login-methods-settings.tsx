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
  useLinkOAuthIdentity,
  useUnlinkOAuthIdentity,
  type LinkableOAuthProvider,
} from '@/hooks/use-auth-identities'

const NATIVE_LINK_EVENTS: Record<LinkableOAuthProvider, string> = {
  apple: 'cairn:apple-identity-linked',
  google: 'cairn:google-identity-linked',
}

const NATIVE_LINK_MESSAGE_TYPES: Record<LinkableOAuthProvider, string> = {
  apple: 'link-apple-identity',
  google: 'link-google-identity',
}

type NativeLinkDetail = {
  ok?: boolean
  cancelled?: boolean
  message?: string
}

function hasReactNativeWebView(): boolean {
  if (typeof window === 'undefined') return false
  return Boolean(
    (window as typeof window & { ReactNativeWebView?: { postMessage: (message: string) => void } })
      .ReactNativeWebView,
  )
}

function isExpoIosWebView(): boolean {
  if (typeof navigator === 'undefined') return false
  return hasReactNativeWebView() && /iPhone|iPad|iPod/i.test(navigator.userAgent)
}

function isExpoAndroidWebView(): boolean {
  if (typeof navigator === 'undefined') return false
  return hasReactNativeWebView() && /Android/i.test(navigator.userAgent)
}

function requestNativeOAuthLink(provider: LinkableOAuthProvider): Promise<NativeLinkDetail> {
  return new Promise((resolve) => {
    if (typeof window === 'undefined') {
      resolve({ ok: false, message: 'ネイティブ連携を開始できませんでした' })
      return
    }

    const nativeBridge = (
      window as typeof window & {
        ReactNativeWebView?: { postMessage: (message: string) => void }
      }
    ).ReactNativeWebView

    if (!nativeBridge) {
      resolve({ ok: false, message: 'ネイティブ連携を開始できませんでした' })
      return
    }

    const eventName = NATIVE_LINK_EVENTS[provider]
    const timeout = window.setTimeout(() => {
      window.removeEventListener(eventName, onResult as EventListener)
      resolve({
        ok: false,
        message: `${providerLabel(provider)} 連携がタイムアウトしました。もう一度お試しください。`,
      })
    }, 120_000)

    function onResult(event: Event) {
      window.clearTimeout(timeout)
      window.removeEventListener(eventName, onResult as EventListener)
      const detail = (event as CustomEvent<NativeLinkDetail>).detail ?? {}
      resolve(detail)
    }

    window.addEventListener(eventName, onResult as EventListener)
    nativeBridge.postMessage(JSON.stringify({ type: NATIVE_LINK_MESSAGE_TYPES[provider] }))
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

function UnlinkedProviderRow({
  provider,
  busy,
  onLink,
}: {
  provider: LinkableOAuthProvider
  busy: boolean
  onLink: () => void
}) {
  const label = providerLabel(provider)
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
        <div style={{ fontSize: 13, fontWeight: 600 }}>{label}</div>
        <div style={{ fontSize: 11.5, color: 'var(--text-3)', marginTop: 2 }}>
          未連携。連携すると次回から {label} でも同じアカウントに入れます。
        </div>
      </div>
      <button
        type="button"
        className="btn btn-ghost"
        style={{ height: 30, fontSize: 12, padding: '0 12px', flexShrink: 0 }}
        disabled={busy}
        onClick={onLink}
      >
        {busy ? '連携中…' : `${label} を連携`}
      </button>
    </div>
  )
}

export function LoginMethodsSettings() {
  const searchParams = useSearchParams()
  const { data: identities, isLoading, isError, error, refetch } = useAuthIdentities()
  const linkApple = useLinkOAuthIdentity('apple')
  const linkGoogle = useLinkOAuthIdentity('google')
  const unlinkIdentity = useUnlinkOAuthIdentity()

  const [message, setMessage] = React.useState<{ text: string; ok: boolean } | null>(null)
  const [unlinkTarget, setUnlinkTarget] = React.useState<UserIdentity | null>(null)
  const [linkingProvider, setLinkingProvider] = React.useState<LinkableOAuthProvider | null>(null)
  // SSR / 初回描画では window を読まず、マウント後にだけネイティブ判定する。
  const [clientRuntime, setClientRuntime] = React.useState({
    nativeWebView: false,
    expoIos: false,
    expoAndroid: false,
  })

  React.useEffect(() => {
    setClientRuntime({
      nativeWebView: hasReactNativeWebView(),
      expoIos: isExpoIosWebView(),
      expoAndroid: isExpoAndroidWebView(),
    })
  }, [])

  const appleIdentity = findIdentity(identities, 'apple')
  const googleIdentity = findIdentity(identities, 'google')
  const canUnlink = (identities?.length ?? 0) >= 2
  const showAndroidAppleHint = clientRuntime.expoAndroid && !appleIdentity
  const useNativeGoogleLink = clientRuntime.nativeWebView
  const useNativeAppleLink = clientRuntime.expoIos

  React.useEffect(() => {
    const linked = searchParams.get('loginLinked')
    if (linked !== 'apple' && linked !== 'google' && linked !== '1') return
    const label =
      linked === 'google' ? 'Google' : linked === 'apple' || linked === '1' ? 'Apple' : null
    if (!label) return
    setMessage({ text: `${label} をログイン方法として連携しました`, ok: true })
    const url = new URL(window.location.href)
    url.searchParams.delete('loginLinked')
    window.history.replaceState({}, '', `${url.pathname}${url.search}${url.hash}`)
    void refetch()
    const timer = window.setTimeout(() => setMessage(null), 5000)
    return () => window.clearTimeout(timer)
  }, [searchParams, refetch])

  const handleLink = async (provider: LinkableOAuthProvider) => {
    setMessage(null)
    setLinkingProvider(provider)
    const label = providerLabel(provider)
    try {
      const useNative =
        provider === 'apple' ? useNativeAppleLink : provider === 'google' ? useNativeGoogleLink : false

      if (useNative) {
        const result = await requestNativeOAuthLink(provider)
        if (result.cancelled) {
          setMessage({ text: `${label} 連携をキャンセルしました`, ok: false })
          return
        }
        if (!result.ok) {
          setMessage({
            text: result.message ?? `${label} との連携に失敗しました`,
            ok: false,
          })
          return
        }
        setMessage({ text: `${label} をログイン方法として連携しました`, ok: true })
        void refetch()
        return
      }

      if (provider === 'apple') await linkApple.mutateAsync()
      else await linkGoogle.mutateAsync()
    } catch (err) {
      setMessage({
        text: err instanceof Error ? err.message : `${label} との連携に失敗しました`,
        ok: false,
      })
    } finally {
      setLinkingProvider(null)
    }
  }

  const handleUnlink = async () => {
    if (!unlinkTarget) return
    const label = providerLabel(unlinkTarget.provider)
    await unlinkIdentity.mutateAsync(unlinkTarget)
    setUnlinkTarget(null)
    setMessage({ text: `${label} 連携を解除しました`, ok: true })
  }

  const busy =
    linkingProvider !== null || linkApple.isPending || linkGoogle.isPending || unlinkIdentity.isPending

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
            {(identities ?? []).map((identity) => {
              const isOAuth = identity.provider === 'apple' || identity.provider === 'google'
              return (
                <IdentityRow
                  key={identity.identity_id}
                  identity={identity}
                  action={
                    isOAuth ? (
                      <button
                        type="button"
                        className="btn btn-ghost"
                        style={{ height: 30, fontSize: 12, padding: '0 12px' }}
                        disabled={!canUnlink || unlinkIdentity.isPending}
                        onClick={() => setUnlinkTarget(identity)}
                      >
                        解除
                      </button>
                    ) : undefined
                  }
                />
              )
            })}

            {!appleIdentity && !showAndroidAppleHint && (
              <UnlinkedProviderRow
                provider="apple"
                busy={busy}
                onLink={() => void handleLink('apple')}
              />
            )}

            {!googleIdentity && (
              <UnlinkedProviderRow
                provider="google"
                busy={busy}
                onLink={() => void handleLink('google')}
              />
            )}

            {showAndroidAppleHint && (
              <div
                style={{
                  padding: '14px 16px',
                  fontSize: 12,
                  color: 'var(--text-3)',
                  borderBottom: googleIdentity ? undefined : '1px solid var(--divider)',
                }}
              >
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

        {unlinkIdentity.isError && (
          <div style={{ padding: '0 16px 12px', fontSize: 12, color: 'var(--red-text)' }}>
            ⚠ {(unlinkIdentity.error as Error).message}
          </div>
        )}
      </div>

      <ConfirmDialog
        open={unlinkTarget !== null}
        title={`${providerLabel(unlinkTarget?.provider ?? '')} 連携を解除しますか？`}
        confirmLabel="解除する"
        busyLabel="解除中…"
        onClose={() => setUnlinkTarget(null)}
        onConfirm={handleUnlink}
        message={`解除すると、このアカウントでは ${providerLabel(unlinkTarget?.provider ?? '')} でサインインできなくなります。メールなど別のログイン方法は残ります。`}
      />
    </section>
  )
}
