// Copyright 2026 Cairn Contributors
// SPDX-License-Identifier: Apache-2.0

import { Suspense } from 'react'
import { PageAI } from '@/components/app/pages/ai'

export default function AIPage() {
  return (
    <Suspense fallback={null}>
      <PageAI/>
    </Suspense>
  )
}
