// Copyright 2026 Cairn Contributors
// SPDX-License-Identifier: Apache-2.0

import { pendingActionRoute } from '@/lib/ai/pending-action-route'
import { rejectPendingAction } from '@/lib/ai/pending-actions'

export async function POST(_req: Request, { params }: { params: Promise<{ id: string }> }) {
  return pendingActionRoute(params, (ctx, id) => rejectPendingAction(ctx, id), 'POST /api/ai/pending-actions/[id]/reject')
}
