// Copyright 2026 Cairn Contributors
// SPDX-License-Identifier: Apache-2.0

'use client'

import React from 'react'
import { useAppShell } from '@/components/app/app-shell-context'
import { TopBar } from '@/components/app/sidebar'
import { TopBarSearch } from '@/components/app/primitives'
import { PageFiles } from '@/components/app/pages/files'

export default function FilesPage() {
  const { openNotif } = useAppShell()
  const [search, setSearch] = React.useState('')
  return (
    <>
      <TopBar title="ファイル" onBell={openNotif}>
        <TopBarSearch value={search} onChange={setSearch} placeholder="ファイルを検索…"/>
      </TopBar>
      <PageFiles externalSearch={search}/>
    </>
  )
}
