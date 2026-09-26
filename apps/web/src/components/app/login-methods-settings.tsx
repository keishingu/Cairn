// Copyright 2026 Cairn Contributors
// SPDX-License-Identifier: Apache-2.0

'use client'

import React from 'react'
import { useSearchParams } from 'next/navigation'
import type { UserIdentity } from '@supabase/supabase-js'
import { useT } from '@/components/locale-provider'
import { ConfirmDialog } from './confirm-dialog'
import {
  findIdentity,
  providerLabel,
  useAuthIdentities,
  useLinkOAuthIdentity,
  useUnlinkOAuthIdentity,
  type LinkableOAuthProvider,
} from '@/hooks/use-auth-identities'
import { formatLoginLinkErrorMessage } from '@/lib/auth-identity-link-errors'
import { toast } from '@/lib/toast'

type Translate = (message: string, values?: Record<string, string | number>) => string

function signInProviderName(provider: string, t: Translate): string {
  if (provider === 'email') return t('Email and password')
  return providerLabel(provider)
}

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

function requestNativeOAuthLink(provider: LinkableOAuthProvider, t: Translate): Promise<NativeLinkDetail> {
  return new Promise((resolve) => {
    if (typeof window === 'undefined') {
      resolve({ ok: false, message: t('Could not start native linking') })
      return
    }

    const nativeBridge = (
      window as typeof window & {
        ReactNativeWebView?: { postMessage: (message: string) => void }
      }
    ).ReactNativeWebView

    if (!nativeBridge) {
      resolve({ ok: false, message: t('Could not start native linking') })
      return
    }

    const eventName = NATIVE_LINK_EVENTS[provider]
    const timeout = window.setTimeout(() => {
      window.removeEventListener(eventName, onResult as EventListener)
      resolve({
        ok: false,
        message: t('{label} linking timed out. Please try again.', { label: providerLabel(provider) }),
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
  const t = useT()
  const label = signInProviderName(identity.provider, t)
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
          {identity.identity_data?.['email']
            ? String(identity.identity_data['email'])
            : t('Linked')}
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
  const t = useT()
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
          {t('Not linked. Link {label} to sign in to the same account next time.', { label })}
        </div>
      </div>
      <button
        type="button"
        className="btn btn-ghost"
        style={{ height: 30, fontSize: 12, padding: '0 12px', flexShrink: 0 }}
        disabled={busy}
        onClick={onLink}
      >
        {busy ? t('Linking...') : t('Link {label}', { label })}
      </button>
    </div>
  )
}

export function LoginMethodsSettings() {
  const t = useT()
  const searchParams = useSearchParams()
  const { data: identities, isLoading, isError, error, refetch } = useAuthIdentities()
  const linkApple = useLinkOAuthIdentity('apple')
  const linkGoogle = useLinkOAuthIdentity('google')
  const unlinkIdentity = useUnlinkOAuthIdentity()

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

  const handledLinkFeedbackRef = React.useRef(false)

  React.useEffect(() => {
    if (handledLinkFeedbackRef.current) return

    const linked = searchParams.get('loginLinked')
    const linkError = searchParams.get('loginLinkError')
    const linkProvider = searchParams.get('loginLinkProvider')

    if (linkError) {
      handledLinkFeedbackRef.current = true
      const key =
        linkError === 'identity_already_exists' ||
        linkError === 'manual_linking_disabled' ||
        linkError === 'callback'
          ? linkError
          : 'callback'
      // OAuth 連携の失敗理由は長文で対処が要るため、既定より長く出す
      toast.error(formatLoginLinkErrorMessage(key, linkProvider), { duration: 8000 })
      const url = new URL(window.location.href)
      url.searchParams.delete('loginLinkError')
      url.searchParams.delete('loginLinkProvider')
      window.history.replaceState({}, '', `${url.pathname}${url.search}${url.hash}`)
      return
    }

    if (linked !== 'apple' && linked !== 'google' && linked !== '1') return
    const label =
      linked === 'google' ? 'Google' : linked === 'apple' || linked === '1' ? 'Apple' : null
    if (!label) return
    handledLinkFeedbackRef.current = true
    toast.success(t('Linked {label} as a sign-in method', { label }))
    const url = new URL(window.location.href)
    url.searchParams.delete('loginLinked')
    window.history.replaceState({}, '', `${url.pathname}${url.search}${url.hash}`)
    void refetch()
  }, [searchParams, refetch, t])

  const handleLink = async (provider: LinkableOAuthProvider) => {
    setLinkingProvider(provider)
    const label = providerLabel(provider)
    try {
      const useNative =
        provider === 'apple' ? useNativeAppleLink : provider === 'google' ? useNativeGoogleLink : false

      if (useNative) {
        const result = await requestNativeOAuthLink(provider, t)
        if (result.cancelled) {
          toast.info(t('Canceled {label} linking', { label }))
          return
        }
        if (!result.ok) {
          toast.error(result.message ?? t('Could not link {label}', { label }))
          return
        }
        toast.success(t('Linked {label} as a sign-in method', { label }))
        void refetch()
        return
      }

      if (provider === 'apple') await linkApple.mutateAsync()
      else await linkGoogle.mutateAsync()
    } catch (err) {
      toast.error(err instanceof Error ? err.message : t('Could not link {label}', { label }))
    } finally {
      setLinkingProvider(null)
    }
  }

  const handleUnlink = async () => {
    if (!unlinkTarget) return
    const label = providerLabel(unlinkTarget.provider)
    await unlinkIdentity.mutateAsync(unlinkTarget)
    setUnlinkTarget(null)
    toast.success(t('Unlinked {label}', { label }))
  }

  const busy =
    linkingProvider !== null || linkApple.isPending || linkGoogle.isPending || unlinkIdentity.isPending

  return (
    <section style={{ marginBottom: 24 }}>
      <h2 style={{ margin: '0 0 10px', fontSize: 14, fontWeight: 700 }}>{t('Sign-in methods')}</h2>
      <p style={{ margin: '0 0 10px', color: 'var(--text-3)', fontSize: 12.5, lineHeight: 1.5 }}>
        {t('You can add more than one sign-in method to the same account. You can link Apple here even when using Hide My Email.')}
      </p>
      <div className="card" style={{ padding: 0 }}>
        {isLoading ? (
          <div style={{ padding: 16, fontSize: 13, color: 'var(--text-3)' }}>{t('Loading...')}</div>
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
                        {t('Unlink')}
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
                {t('The Android app does not offer Apple sign-in, so you cannot link it here. Link it from the web or iOS.')}
              </div>
            )}
          </>
        )}

        {unlinkIdentity.isError && (
          <div style={{ padding: '0 16px 12px', fontSize: 12, color: 'var(--red-text)' }}>
            ⚠ {(unlinkIdentity.error as Error).message}
          </div>
        )}
      </div>

      <ConfirmDialog
        open={unlinkTarget !== null}
        title={t('Unlink {label}?', { label: providerLabel(unlinkTarget?.provider ?? '') })}
        confirmLabel={t('Unlink sign-in method')}
        busyLabel={t('Unlinking...')}
        onClose={() => setUnlinkTarget(null)}
        onConfirm={handleUnlink}
        message={t('Unlinking removes {label} sign-in for this account. Other methods, such as email, remain.', { label: providerLabel(unlinkTarget?.provider ?? '') })}
      />
    </section>
  )
}
