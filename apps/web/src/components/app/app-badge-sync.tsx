// Copyright 2026 Cairn Contributors
// SPDX-License-Identifier: Apache-2.0

'use client'

import { useEffect } from 'react'
import { useAppBadgeCount } from '@/lib/notifications/client'

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
 * サインアウト時はこのコンポーネントが認証エリア（(app) レイアウト）とともに
 * アンマウントされ /auth/login へ遷移する。アンマウント時にバッジをクリアし、
 * 前ユーザーの未読数がアプリアイコンに残らないようにする。
 */
export function AppBadgeSync() {
  const unreadCount = useAppBadgeCount()

  useEffect(() => {
    if (typeof navigator === 'undefined' || !('setAppBadge' in navigator)) return
    // 未取得（null）の間は何もしない。既知の 0 でのみクリアする。
    // ローディング・エラーを 0 と誤認すると、Service Worker が付けた既存バッジを
    // 未読があるのに消してしまう（オフライン起動・一時的な 500 など）
    if (unreadCount === null) return
    if (unreadCount > 0) {
      navigator.setAppBadge(unreadCount).catch(() => { /* 未インストール等では失敗しうるが無視 */ })
    } else {
      navigator.clearAppBadge().catch(() => { /* 同上 */ })
    }
  }, [unreadCount])

  // サインアウト等で認証エリアを抜けるとき（アンマウント時）にバッジをクリアする。
  // 各サインアウト経路（sidebar / mobile settings / mobile-signout）に個別対応せず、
  // 認証セッションに紐づく本コンポーネントの寿命に合わせて 1 箇所で確実に消す
  useEffect(() => {
    return () => {
      if (typeof navigator === 'undefined' || !('clearAppBadge' in navigator)) return
      navigator.clearAppBadge().catch(() => { /* 未対応環境では失敗しうるが無視 */ })
    }
  }, [])

  return null
}
