// Copyright 2026 Cairn Contributors
// SPDX-License-Identifier: Apache-2.0

'use client'

import { useEffect } from 'react'
import { useAppBadgeCount } from '@/lib/notifications/client'
import { createClient } from '@/lib/supabase/client'

/**
 * アプリ表示中に OS のアプリアイコンの通知バッジ（Badging API）を未読数へ追従させる。
 *
 * アプリ非起動時のバッジ更新は Service Worker の push ハンドラが担う（sw.js）。
 * このコンポーネントは前面表示中に未読を既読化したケースなどでバッジを
 * 即時に減算・クリアするために存在する。Realtime で未読数が更新されると
 * 再レンダリングされ、バッジも追従する。
 *
 * ワークスペース横断の未読総数（useAppBadgeCount）を使う。ベル表示用の
 * useUnreadNotificationCount は表示中ワークスペースだけに絞られており、
 * それをバッジに使うと他ワークスペースの未読があるのに 0 件表示中の
 * ワークスペースを開いた瞬間にバッジが消えてしまう（Push 側の集計と不一致になる）
 *
 * バッジ API 非対応（未インストールのブラウザタブ・iOS 16.3 以前等）では no-op。
 *
 * Desktop(Electron): macOS Dock / Linux ランチャーは navigator.setAppBadge が
 * Electron 経由でそのまま数字を出す。Windows タスクバーは Badging API 非対応のため、
 * cairnDesktop.setBadgeCount で main へ件数を渡し、オーバーレイを出す。
 *
 * サインアウト時は前ユーザーの未読数がアプリアイコンに残らないよう、
 * Supabase の SIGNED_OUT イベントに紐づけてバッジをクリアする。
 */
export function AppBadgeSync() {
  const unreadCount = useAppBadgeCount()

  useEffect(() => {
    // 未取得（null）の間は何もしない。既知の 0 でのみクリアする。
    // ローディング・エラーを 0 と誤認すると、Service Worker が付けた既存バッジを
    // 未読があるのに消してしまう（オフライン起動・一時的な 500 など）
    if (unreadCount === null) return

    if (typeof navigator !== 'undefined' && 'setAppBadge' in navigator) {
      if (unreadCount > 0) {
        navigator.setAppBadge(unreadCount).catch(() => { /* 未インストール等では失敗しうるが無視 */ })
      } else {
        navigator.clearAppBadge().catch(() => { /* 同上 */ })
      }
    }

    // Desktop(Electron) の Windows タスクバー向け。macOS/Linux は上の setAppBadge で足りる
    if (typeof window !== 'undefined') {
      window.cairnDesktop?.setBadgeCount?.(unreadCount)
    }
  }, [unreadCount])

  // サインアウト時にバッジをクリアし、前ユーザーの未読数を残さない。
  // 各サインアウト経路（sidebar / mobile settings / mobile-signout）に個別対応せず、
  // SIGNED_OUT イベント 1 箇所で確実に消す。コンポーネントのアンマウントに紐づけると、
  // 認証済みのまま公開ルート（/invite 等）へ遷移しただけでも消えてしまうため使わない
  useEffect(() => {
    const supabase = createClient()
    const { data } = supabase.auth.onAuthStateChange((event) => {
      if (event !== 'SIGNED_OUT') return
      if (typeof navigator !== 'undefined' && 'clearAppBadge' in navigator) {
        navigator.clearAppBadge().catch(() => { /* 未対応環境では失敗しうるが無視 */ })
      }
      if (typeof window !== 'undefined') {
        window.cairnDesktop?.setBadgeCount?.(0)
      }
    })
    return () => data.subscription.unsubscribe()
  }, [])

  return null
}
