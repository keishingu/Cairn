// Copyright 2026 Cairn Contributors
// SPDX-License-Identifier: Apache-2.0

'use client'

import { useAppShell } from '@/components/app/app-shell-context'
import { TopBar } from '@/components/app/sidebar'
import { TopBarSearch } from '@/components/app/primitives'
import { PageDashboard } from '@/components/app/pages/dashboard'

export default function DashboardPage() {
  const { openPanel, openNotif } = useAppShell()
  return (
    <>
      <TopBar title="ダッシュボード" subtitle="2024 Q2" onBell={openNotif}>
        <TopBarSearch/>
      </TopBar>
      <PageDashboard openPanel={openPanel}/>
    </>
  )
}
