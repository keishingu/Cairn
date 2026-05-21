// Copyright 2026 Cairn Contributors
// SPDX-License-Identifier: Apache-2.0

'use client'

import { MobileHeader } from '../mobile-header'
import { PageTasks } from '../../pages/tasks'

export function MobileTasks() {
  return (
    <div style={{ display: 'flex', flexDirection: 'column', flex: 1, minHeight: 0, background: 'var(--bg)' }}>
      <MobileHeader title="マイタスク" />
      <PageTasks isMobile />
    </div>
  )
}
