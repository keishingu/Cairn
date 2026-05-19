// Copyright 2026 Cairn Contributors
// SPDX-License-Identifier: Apache-2.0

import { serve } from 'inngest/next'
import { inngest } from '@/lib/inngest/client'

export const { GET, POST, PUT } = serve({
  client: inngest,
  functions: [],
})
