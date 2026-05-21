// Copyright 2026 Cairn Contributors
// SPDX-License-Identifier: Apache-2.0

'use client'

import { useAppShell } from '@/components/app/app-shell-context'
import { PageCalendar } from '@/components/app/pages/calendar'

export function MobileCalendar() {
  const { openPanel } = useAppShell()
  return <PageCalendar openPanel={openPanel} isMobile />
}
