// Copyright 2026 Cairn Contributors
// SPDX-License-Identifier: Apache-2.0

'use client'

import React, { use } from 'react'
import { useAppShell } from '@/components/app/app-shell-context'
import { TopBar } from '@/components/app/sidebar'
import { TopBarSearch } from '@/components/app/primitives'
import { PageMembers } from '@/components/app/pages/members-page'

interface Props {
  params: Promise<{ id: string }>
}

export default function MemberDetailPage({ params }: Props) {
  const { id } = use(params)
  const { openNotif } = useAppShell()
  const [search, setSearch] = React.useState('')
  return (
    <>
      <TopBar title="メンバー" onBell={openNotif}>
        <TopBarSearch value={search} onChange={setSearch} placeholder="メンバーを検索…"/>
      </TopBar>
      <PageMembers initialUserId={id} externalSearch={search}/>
    </>
  )
}
