// Copyright 2026 Cairn Contributors
// SPDX-License-Identifier: Apache-2.0

'use client'

import { useAppShell } from '@/components/app/app-shell-context'
import { TopBar } from '@/components/app/sidebar'
import { PageFiles } from '@/components/app/pages/files'

export default function FilesPage() {
  const { openNotif } = useAppShell()
  return (
    <>
      <TopBar title="ファイル" onBell={openNotif}/>
      <PageFiles />
    </>
  )
}
