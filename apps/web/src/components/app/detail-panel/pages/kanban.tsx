// Copyright 2026 Cairn Contributors
// SPDX-License-Identifier: Apache-2.0

'use client'

import { useAppShell } from '@/components/app/app-shell-context'
import { PageKanban } from '@/components/app/pages/kanban-page'

export function MobileKanban() {
  const { openPanel } = useAppShell()
  return <PageKanban openPanel={openPanel} isMobile />
}
