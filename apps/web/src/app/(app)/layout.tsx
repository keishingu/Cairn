// Copyright 2026 Cairn Contributors
// SPDX-License-Identifier: Apache-2.0

import { headers } from 'next/headers'
import { PCShell } from './_shells/pc-shell'
import { MobileShell } from './_shells/mobile-shell'
import { PresenceTracker } from '@/components/presence-tracker'
import { RealtimeProvider } from '@/components/realtime/realtime-provider'

export default async function AppLayout({ children }: { children: React.ReactNode }) {
  const headersList = await headers()
  const isMobile = headersList.get('x-device') === 'mobile'

  return (
    <RealtimeProvider>
      <PresenceTracker />
      {isMobile ? <MobileShell /> : <PCShell>{children}</PCShell>}
    </RealtimeProvider>
  )
}
