// Copyright 2026 Cairn Contributors
// SPDX-License-Identifier: Apache-2.0

'use client'

import React from 'react'
import { useT } from '@/components/locale-provider'
import { TopBar } from '@/components/app/sidebar'
import { TopBarSearch } from '@/components/app/primitives'
import { PageFiles } from '@/components/app/pages/files'

export default function FilesPage() {
  const t = useT()
  const [search, setSearch] = React.useState('')
  return (
    <>
      <TopBar title={t('Files')}>
        <TopBarSearch value={search} onChange={setSearch} placeholder={t('Search files…')} />
      </TopBar>
      <PageFiles externalSearch={search}/>
    </>
  )
}
