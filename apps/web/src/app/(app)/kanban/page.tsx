// Copyright 2026 Cairn Contributors
// SPDX-License-Identifier: Apache-2.0

'use client'

import { useAppShell } from '@/components/app/app-shell-context'
import { TopBar } from '@/components/app/sidebar'
import { TopBarSearch } from '@/components/app/primitives'
import { PageKanban } from '@/components/app/pages/kanban-page'

export default function KanbanPage() {
  const { openPanel, openNotif } = useAppShell()
  return (
    <>
      <TopBar title="カンバン" subtitle="8 件 / 5 ステージ" onBell={openNotif}>
        <TopBarSearch/>
      </TopBar>
      <PageKanban openPanel={openPanel}/>
    </>
  )
}
