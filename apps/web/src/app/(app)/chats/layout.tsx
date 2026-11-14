// Copyright 2026 Cairn Contributors
// SPDX-License-Identifier: Apache-2.0

import type { ReactNode } from 'react'
import { PageChat } from '@/components/app/pages/chat'

export default function ChatsLayout({ children }: { children: ReactNode }) {
  return <><PageChat />{children}</>
}
