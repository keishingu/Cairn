// Copyright 2026 Cairn Contributors
// SPDX-License-Identifier: Apache-2.0

import { headers } from 'next/headers'
import { PCShell } from './_shells/pc-shell'
import { MobileShell } from './_shells/mobile-shell'
import { RealtimeProvider } from '@/components/realtime/realtime-provider'
import { FocusWarmup } from '@/components/app/focus-warmup'

export default async function AppLayout({ children }: { children: React.ReactNode }) {
  const headersList = await headers()
  const isMobile = headersList.get('x-device') === 'mobile'
  const isWebView = headersList.get('x-webview') === '1'

  return (
    <RealtimeProvider>
      <FocusWarmup />
      {isMobile ? <MobileShell hideNav={isWebView} /> : <PCShell>{children}</PCShell>}
    </RealtimeProvider>
  )
}
