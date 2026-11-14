// Copyright 2026 Cairn Contributors
// SPDX-License-Identifier: Apache-2.0

import { pendingActionRoute } from '@/lib/ai/pending-action-route'
import { getPendingAction } from '@/lib/ai/pending-actions'

export async function GET(_req: Request, { params }: { params: Promise<{ id: string }> }) {
  return pendingActionRoute(params, (ctx, id) => getPendingAction(ctx, id), 'GET /api/ai/pending-actions/[id]')
}
