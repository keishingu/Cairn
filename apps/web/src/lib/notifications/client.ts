// Copyright 2026 Cairn Contributors
// SPDX-License-Identifier: Apache-2.0

import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { fetchWithAuth } from '@/lib/fetch-with-auth'
import type { NotificationDto } from '@/app/api/notifications/route'

export type { NotificationDto }

export const notificationQueryKeys = {
  list: (filter: string) => ['notifications', filter] as const,
}

async function fetchNotifications(filter: string): Promise<NotificationDto[]> {
  const res = await fetchWithAuth(`/api/notifications?filter=${filter}`)
  if (!res.ok) throw new Error('通知の取得に失敗しました')
  return res.json()
}

async function markNotificationsRead(ids?: string[]): Promise<{ updated: number }> {
  const res = await fetchWithAuth('/api/notifications', {
    method: 'PATCH',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(ids ? { ids } : {}),
  })
  if (!res.ok) throw new Error('既読処理に失敗しました')
  return res.json()
}

export function useNotifications(filter: string) {
  // 通知の即時更新は RealtimeProvider 経由（notifications / channel_read_states の購読）
  return useQuery({
    queryKey: notificationQueryKeys.list(filter),
    queryFn: () => fetchNotifications(filter),
  })
}

export function useUnreadNotificationCount(): number {
  const { data = [] } = useNotifications('unread')
  return data.length
}

async function fetchBadgeCount(): Promise<number> {
  const res = await fetchWithAuth('/api/notifications/badge-count')
  if (!res.ok) throw new Error('未読バッジ数の取得に失敗しました')
  const data = await res.json() as { count: number }
  return data.count
}

/**
 * OS アプリアイコンのバッジ用の未読数（全ワークスペース横断）。
 * `useUnreadNotificationCount` は表示中ワークスペースのベル用で件数が異なるため、
 * バッジ表示にはこちらを使う（サーバー Push 側の集計元と揃える）。
 *
 * 未取得（ローディング）・取得失敗時は `null` を返す。呼び出し側はこれを
 * 「不明」として扱い、既知の 0 と区別すること（オフライン起動や一時的な 500 で
 * Service Worker が付けた既存バッジを誤って消さないため）。
 *
 * マウント直後にキャッシュだけで値を返さない（`isFetchedAfterMount` で判定）。
 * app 全体の 60s staleTime を継承すると、公開ルート（/invite 等）滞在中に
 * push で SW がバッジを更新→1分以内に復帰した際、古いキャッシュの 0 を返して
 * フレッシュ取得前にバッジを消してしまう。`staleTime: 0` でマウント毎に必ず
 * 再取得し、完了までは `null`（不明）を返す。
 */
export function useAppBadgeCount(): number | null {
  const { data, isFetchedAfterMount } = useQuery({
    queryKey: ['notifications', 'badge-count'],
    queryFn: fetchBadgeCount,
    staleTime: 0,
  })
  if (!isFetchedAfterMount) return null
  return data ?? null
}

export function useMarkNotificationsRead() {
  const queryClient = useQueryClient()
  return useMutation({
    mutationFn: (ids?: string[]) => markNotificationsRead(ids),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['notifications'] })
    },
  })
}

export function formatRelativeTime(iso: string): string {
  const diff = Date.now() - new Date(iso).getTime()
  const minutes = Math.floor(diff / 60_000)
  if (minutes < 1) return 'たった今'
  if (minutes < 60) return `${minutes}分前`
  const hours = Math.floor(minutes / 60)
  if (hours < 24) return `${hours}時間前`
  const days = Math.floor(hours / 24)
  if (days === 1) return '昨日'
  return `${days}日前`
}
