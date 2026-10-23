// Copyright 2026 Cairn Contributors
// SPDX-License-Identifier: Apache-2.0

import { NextResponse } from 'next/server'
import { getAuthUser } from '@/lib/get-auth-context'
import { getUnreadNotificationCount } from '@/lib/notifications/badge'

/**
 * OS のアプリアイコンバッジ用に、ワークスペースを問わない未読通知総数を返す。
 * Push 送信時のバッジ数（lib/push/send.ts）と同じ集計元を使うことで、
 * フォアグラウンド同期（AppBadgeSync）とバックグラウンド更新の数値を一致させる。
 */
export async function GET() {
  const { userId, error } = await getAuthUser()
  if (error) return error

  const count = await getUnreadNotificationCount(userId)
  return NextResponse.json({ count })
}
