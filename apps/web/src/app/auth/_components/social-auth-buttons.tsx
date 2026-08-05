// Copyright 2026 Cairn Contributors
// SPDX-License-Identifier: Apache-2.0

'use client'

import React from 'react'
import { createClient } from '@/lib/supabase/client'

interface Props {
  inviteToken?: string | null
  nextPath?: string | null
}

export function SocialAuthButtons({ inviteToken, nextPath }: Props) {
  const [loadingProvider, setLoadingProvider] = React.useState<'google' | 'apple' | null>(null)

  async function handleOAuth(provider: 'google' | 'apple') {
    setLoadingProvider(provider)
    const supabase = createClient()
    const callbackUrl = new URL('/api/auth/callback', window.location.origin)
    if (inviteToken) callbackUrl.searchParams.set('invite', inviteToken)
    if (nextPath) callbackUrl.searchParams.set('next', nextPath)

    await supabase.auth.signInWithOAuth({
      provider,
      options: { redirectTo: callbackUrl.toString() },
    })
    // リダイレクトするのでローディングはリセットしない
  }

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
      <button
        type="button"
        disabled={loadingProvider !== null}
        onClick={() => handleOAuth('google')}
        style={{
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
          gap: 10,
          padding: '10px 16px',
          borderRadius: 8,
          border: '1px solid var(--border-2)',
          background: loadingProvider ? 'var(--border-2)' : 'var(--card)',
          color: loadingProvider ? 'var(--text-4)' : 'var(--text)',
          fontSize: 14,
          fontWeight: 500,
          cursor: loadingProvider ? 'default' : 'pointer',
          fontFamily: 'inherit',
          transition: 'background 0.15s',
        }}
      >
        {loadingProvider === 'google' ? (
          <span style={{ fontSize: 12, color: 'var(--text-3)' }}>リダイレクト中...</span>
        ) : (
          <>
            <GoogleIcon />
            Google でサインイン
          </>
        )}
      </button>

      <button
        type="button"
        disabled={loadingProvider !== null}
        onClick={() => handleOAuth('apple')}
        style={{
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
          gap: 10,
          padding: '10px 16px',
          borderRadius: 8,
          border: '1px solid var(--border-2)',
          background: loadingProvider ? 'var(--border-2)' : 'var(--card)',
          color: loadingProvider ? 'var(--text-4)' : 'var(--text)',
          fontSize: 14,
          fontWeight: 500,
          cursor: loadingProvider ? 'default' : 'pointer',
          fontFamily: 'inherit',
          transition: 'background 0.15s',
        }}
      >
        {loadingProvider === 'apple' ? (
          <span style={{ fontSize: 12, color: 'var(--text-3)' }}>リダイレクト中...</span>
        ) : (
          <>
            <AppleIcon />
            Apple でサインイン
          </>
        )}
      </button>
    </div>
  )
}

function GoogleIcon() {
  return (
    <svg width="18" height="18" viewBox="0 0 18 18" fill="none" xmlns="http://www.w3.org/2000/svg">
      <path d="M17.64 9.2c0-.637-.057-1.251-.164-1.84H9v3.481h4.844a4.14 4.14 0 0 1-1.796 2.716v2.259h2.908c1.702-1.567 2.684-3.875 2.684-6.615z" fill="#4285F4"/>
      <path d="M9 18c2.43 0 4.467-.806 5.956-2.18l-2.908-2.259c-.806.54-1.837.86-3.048.86-2.344 0-4.328-1.584-5.036-3.711H.957v2.332A8.997 8.997 0 0 0 9 18z" fill="#34A853"/>
      <path d="M3.964 10.71A5.41 5.41 0 0 1 3.682 9c0-.593.102-1.17.282-1.71V4.958H.957A8.996 8.996 0 0 0 0 9c0 1.452.348 2.827.957 4.042l3.007-2.332z" fill="#FBBC05"/>
      <path d="M9 3.58c1.321 0 2.508.454 3.44 1.345l2.582-2.58C13.463.891 11.426 0 9 0A8.997 8.997 0 0 0 .957 4.958L3.964 7.29C4.672 5.163 6.656 3.58 9 3.58z" fill="#EA4335"/>
    </svg>
  )
}

function AppleIcon() {
  return (
    <svg width="18" height="18" viewBox="0 0 18 18" fill="currentColor" xmlns="http://www.w3.org/2000/svg">
      <path d="M12.003 0c.06.857-.248 1.701-.776 2.33-.534.636-1.37 1.13-2.206 1.07-.08-.83.285-1.7.78-2.29C10.3.49 11.197 0 12.003 0zm3.072 13.257c-.4.875-.59 1.267-1.1 2.04-.715 1.09-1.722 2.447-2.969 2.458-1.107.01-1.393-.722-2.896-.714-1.503.009-1.816.727-2.931.716-1.247-.012-2.2-1.233-2.914-2.322C.34 13.017-.168 9.903.837 7.888c.71-1.425 1.99-2.26 3.197-2.26 1.19 0 1.938.723 2.921.723.956 0 1.538-.726 2.915-.726 1.083 0 2.23.59 2.946 1.61-2.588 1.42-2.169 5.118.26 6.022z"/>
    </svg>
  )
}
