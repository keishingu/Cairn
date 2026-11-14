import React from 'react'
import { AppState } from 'react-native'
import { useQuery, useQueryClient } from '@tanstack/react-query'
import * as Notifications from 'expo-notifications'
import { APP_BADGE_COUNT_PATH, appBadgeQueryKey, applyAppBadge, parseAppBadgeCount } from '../lib/app-badge'
import { fetchApiJson } from '../lib/fetch-api-json'
import { supportsNotifications } from '../lib/push-registration'

export async function setAppBadge(count: number): Promise<void> {
  if (!supportsNotifications) return
  await applyAppBadge(count, Notifications.setBadgeCountAsync)
}

/**
 * アイコンの数字をサーバーの全ワークスペース横断の未読通知数へ追従させる。
 * 既読化と Realtime は ['notifications'] の invalidate に乗るので、ここでは前面復帰だけを見る。
 * 取得に失敗したら 0 にせず今の数字を据え置き、記録する（Push が付けた数字を誤って消さない）。
 * 通知一覧の「Push通知」スイッチとは無関係に動かす。
 */
export function useAppBadgeSync(userId: string | null) {
  const queryClient = useQueryClient()
  const { data, dataUpdatedAt, error, errorUpdatedAt } = useQuery({
    queryKey: appBadgeQueryKey,
    queryFn: async () =>
      parseAppBadgeCount(await fetchApiJson<unknown>(APP_BADGE_COUNT_PATH, '未読バッジ数')),
    enabled: userId !== null,
  })

  // 件数が前回と同じでも反映する。背景で Push が OS の数字だけを変えていることがあるため
  React.useEffect(() => {
    if (userId === null || data === undefined) return
    void setAppBadge(data)
  }, [data, dataUpdatedAt, userId])

  React.useEffect(() => {
    if (error) console.warn('[AppBadge] Failed to fetch the unread count', error.message)
  }, [error, errorUpdatedAt])

  React.useEffect(() => {
    if (userId === null) return
    const sub = AppState.addEventListener('change', (state) => {
      if (state === 'active') void queryClient.invalidateQueries({ queryKey: appBadgeQueryKey })
    })
    return () => sub.remove()
  }, [queryClient, userId])
}
