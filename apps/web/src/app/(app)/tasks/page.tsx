// Copyright 2026 Cairn Contributors
// SPDX-License-Identifier: Apache-2.0

'use client'

import { useAppShell } from '@/components/app/app-shell-context'
import { TopBar } from '@/components/app/sidebar'
import { PageTasks } from '@/components/app/pages/tasks'

export default function TasksPage() {
  const { openNotif } = useAppShell()
  return (
    <>
      <TopBar title="マイタスク" onBell={openNotif}/>
      <PageTasks />
    </>
  )
}
