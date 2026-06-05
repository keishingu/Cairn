// Copyright 2026 Cairn Contributors
// SPDX-License-Identifier: Apache-2.0

'use client'

import { useAppShell } from '@/components/app/app-shell-context'
import { TopBar } from '@/components/app/sidebar'
import { PageProjects } from '@/components/app/pages/projects'

export default function ProjectsPage() {
  const { openPanel, openNotif } = useAppShell()
  return (
    <>
      <TopBar title="プロジェクト" subtitle="8 件 · 進行中 7" onBell={openNotif}/>
      <PageProjects openPanel={openPanel}/>
    </>
  )
}
