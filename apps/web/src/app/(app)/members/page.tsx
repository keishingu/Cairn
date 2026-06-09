// Copyright 2026 Cairn Contributors
// SPDX-License-Identifier: Apache-2.0

'use client'

import React from 'react'
import { TopBar } from '@/components/app/sidebar'
import { TopBarSearch } from '@/components/app/primitives'
import { PageMembers } from '@/components/app/pages/members-page'

export default function MembersPage() {
  const [search, setSearch] = React.useState('')
  return (
    <>
      <TopBar title="メンバー">
        <TopBarSearch value={search} onChange={setSearch} placeholder="メンバーを検索…"/>
      </TopBar>
      <PageMembers externalSearch={search}/>
    </>
  )
}
