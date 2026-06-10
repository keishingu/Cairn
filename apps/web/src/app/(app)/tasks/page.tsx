// Copyright 2026 Cairn Contributors
// SPDX-License-Identifier: Apache-2.0

'use client'

import { TopBar } from '@/components/app/sidebar'
import { PageTasks } from '@/components/app/pages/tasks'

export default function TasksPage() {
  return (
    <>
      <TopBar title="マイタスク"/>
      <PageTasks />
    </>
  )
}
