// Copyright 2026 Cairn Contributors
// SPDX-License-Identifier: Apache-2.0

import { after } from 'next/server'
import type { DeliveryResult } from './interactions'

// アプリへの配送の記録（運用のためのもの）。利用者への応答を待たせないよう、応答を返した後に書く。
// 記録が遅れても失敗しても、アプリが処理した結果をそのまま返す（失敗扱いにすると押し直しで新しい interaction_id になり、アプリ側の副作用が重なる）
export function recordDeliveryAfterResponse(input: {
  installationId: string
  userId: string
  type: 'block_actions' | 'view_submission' | 'slash_command'
  actionId: string | null
  delivery: DeliveryResult
}): void {
  const { delivery } = input
  after(async () => {
    try {
      const { db, appInteractionDeliveries } = await import('@cairn/db')
      await db.insert(appInteractionDeliveries).values({
        installationId: input.installationId,
        userId: input.userId,
        type: input.type,
        actionId: input.actionId,
        status: delivery.status,
        httpStatus: delivery.httpStatus,
        durationMs: delivery.durationMs,
        error: delivery.status === 'delivered' ? null : delivery.error.slice(0, 500),
      })
    } catch (err) {
      console.error(`[app-interactions] failed to record ${input.type} delivery:`, err)
    }
  })
}
