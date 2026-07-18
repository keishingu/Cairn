// Copyright 2026 Cairn Contributors
// SPDX-License-Identifier: Apache-2.0

'use client'

import React from 'react'
import { TopBar } from '@/components/app/sidebar'
import { PageTasks } from '@/components/app/pages/tasks'

export default function TasksPage() {
  return (
    <>
      <TopBar title="マイタスク"/>
      <React.Suspense fallback={null}>
        <PageTasks />
      </React.Suspense>
    </>
  )
}
