// Copyright 2026 Cairn Contributors
// SPDX-License-Identifier: Apache-2.0

'use client'

import React from 'react'
import { useT } from '@/components/locale-provider'
import { TopBar } from '@/components/app/sidebar'
import { TopBarSearch } from '@/components/app/primitives'
import { PageMembers } from '@/components/app/pages/members-page'

export default function MembersPage() {
  const t = useT()
  const [search, setSearch] = React.useState('')
  return (
    <>
      <TopBar title={t('Members')}>
        <TopBarSearch value={search} onChange={setSearch} placeholder={t('Search members…')} />
      </TopBar>
      <PageMembers externalSearch={search}/>
    </>
  )
}
