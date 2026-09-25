// Copyright 2026 Cairn Contributors
// SPDX-License-Identifier: Apache-2.0

'use client'

import React from 'react'
import { useT } from '@/components/locale-provider'
import { TopBar } from '@/components/app/sidebar'
import { PageTasks } from '@/components/app/pages/tasks'

export default function TasksPage() {
  const t = useT()
  return (
    <>
      <TopBar title={t('My tasks')} />
      <React.Suspense fallback={null}>
        <PageTasks />
      </React.Suspense>
    </>
  )
}
