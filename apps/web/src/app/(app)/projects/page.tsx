// Copyright 2026 Cairn Contributors
// SPDX-License-Identifier: Apache-2.0

'use client'

import React from 'react'
import { useAppShell } from '@/components/app/app-shell-context'
import { TopBar } from '@/components/app/sidebar'
import { TopBarSearch } from '@/components/app/primitives'
import { PageProjects } from '@/components/app/pages/projects'

export default function ProjectsPage() {
  const { openPanel } = useAppShell()
  const [search, setSearch] = React.useState('')
  return (
    <>
      <TopBar title="プロジェクト" subtitle="8 件 · 進行中 7">
        <TopBarSearch value={search} onChange={setSearch} placeholder="プロジェクトを検索…"/>
      </TopBar>
      <PageProjects openPanel={openPanel} search={search}/>
    </>
  )
}
