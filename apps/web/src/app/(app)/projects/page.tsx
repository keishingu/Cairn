// Copyright 2026 Cairn Contributors
// SPDX-License-Identifier: Apache-2.0

'use client'

import React from 'react'
import { useT } from '@/components/locale-provider'
import { useAppShell } from '@/components/app/app-shell-context'
import { TopBar } from '@/components/app/sidebar'
import { TopBarSearch } from '@/components/app/primitives'
import { PageProjects } from '@/components/app/pages/projects'

export default function ProjectsPage() {
  const t = useT()
  const { openPanel } = useAppShell()
  const [search, setSearch] = React.useState('')
  return (
    <>
      <TopBar title={t('Projects')}>
        <TopBarSearch value={search} onChange={setSearch} placeholder={t('Search projects…')} />
      </TopBar>
      <PageProjects openPanel={openPanel} search={search}/>
    </>
  )
}
