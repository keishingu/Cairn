// Copyright 2026 Cairn Contributors
// SPDX-License-Identifier: Apache-2.0

'use client'

import { useAppShell } from '@/components/app/app-shell-context'
import { TopBar } from '@/components/app/sidebar'
import { TopBarSearch } from '@/components/app/primitives'
import { PageCalendar } from '@/components/app/pages/calendar'

export default function CalendarPage() {
  const { openPanel, openNotif } = useAppShell()
  return (
    <>
      <TopBar title="カレンダー" onBell={openNotif}>
        <TopBarSearch/>
      </TopBar>
      <PageCalendar openPanel={openPanel}/>
    </>
  )
}
