// Copyright 2026 Cairn Contributors
// SPDX-License-Identifier: Apache-2.0

'use client'

import { useAppShell } from '@/components/app/app-shell-context'
import { TopBar } from '@/components/app/sidebar'
import { PlaceholderPage } from '@/components/app/primitives'

export default function MembersPage() {
  const { openNotif } = useAppShell()
  return (
    <>
      <TopBar title="メンバー" onBell={openNotif}/>
      <PlaceholderPage name="メンバー" icon="users"/>
    </>
  )
}
