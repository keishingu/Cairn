// Copyright 2026 Cairn Contributors
// SPDX-License-Identifier: Apache-2.0

import { headers } from 'next/headers'
import { PCShell } from './_shells/pc-shell'
import { MobileShell } from './_shells/mobile-shell'
import { RealtimeProvider } from '@/components/realtime/realtime-provider'
import { FocusWarmup } from '@/components/app/focus-warmup'
import { AppBadgeSync } from '@/components/app/app-badge-sync'
import { AppModalHost } from '@/components/app/blocks/app-modal-host'
import { PostHogUserIdentity } from '@/components/posthog-user-identity'
import { AppearanceDbSync } from '@/components/app/appearance-db-sync'
import { LocaleDbSync } from '@/components/app/locale-db-sync'

export default async function AppLayout({ children }: { children: React.ReactNode }) {
  const headersList = await headers()
  const isMobile = headersList.get('x-device') === 'mobile'
  const isWebView = headersList.get('x-webview') === '1'

  return (
    <RealtimeProvider>
      <PostHogUserIdentity />
      <AppearanceDbSync />
      <LocaleDbSync />
      <FocusWarmup />
      <AppBadgeSync />
      {/* アプリの WebView ではネイティブ側がモーダルを出すので、二重に出さない */}
      {!isWebView && <AppModalHost />}
      {isMobile ? (
        <MobileShell hideNav={isWebView} webView={isWebView} />
      ) : (
        <PCShell>{children}</PCShell>
      )}
    </RealtimeProvider>
  )
}
