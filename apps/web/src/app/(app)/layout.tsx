// Copyright 2026 Cairn Contributors
// SPDX-License-Identifier: Apache-2.0

import { headers } from 'next/headers'
import { PCShell } from './_shells/pc-shell'
import { MobileShell } from './_shells/mobile-shell'

export default async function AppLayout({ children }: { children: React.ReactNode }) {
  const headersList = await headers()
  const isMobile = headersList.get('x-device') === 'mobile'
  const isWebView = headersList.get('x-webview') === '1'

  if (isMobile) return <MobileShell isWebView={isWebView} />
  return <PCShell>{children}</PCShell>
}
