// Copyright 2026 Cairn Contributors
// SPDX-License-Identifier: Apache-2.0

'use client'

import { useEffect } from 'react'
import { useUnreadNotificationCount } from '@/lib/notifications/client'

/**
 * アプリ表示中に OS のアプリアイコンの通知バッジ（Badging API）を未読数へ追従させる。
 *
 * アプリ非起動時のバッジ更新は Service Worker の push ハンドラが担う（sw.js）。
 * このコンポーネントは前面表示中に未読を既読化したケースなどでバッジを
 * 即時に減算・クリアするために存在する。Realtime で未読数が更新されると
 * 再レンダリングされ、バッジも追従する。
 *
 * バッジ API 非対応（未インストールのブラウザタブ・iOS 16.3 以前等）では no-op。
 */
export function AppBadgeSync() {
  const unreadCount = useUnreadNotificationCount()

  useEffect(() => {
    if (typeof navigator === 'undefined' || !('setAppBadge' in navigator)) return
    if (unreadCount > 0) {
      navigator.setAppBadge(unreadCount).catch(() => { /* 未インストール等では失敗しうるが無視 */ })
    } else {
      navigator.clearAppBadge().catch(() => { /* 同上 */ })
    }
  }, [unreadCount])

  return null
}
