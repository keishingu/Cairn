'use client'

import { useEffect } from 'react'

/**
 * 登録する Service Worker の URL。
 * 開発時は `?dev=1` を付け、sw.js 側でキャッシュを使わないモードにする。
 * dev サーバーのチャンクは内容が変わってもファイル名が変わらないため、Cache First で返すと
 * 編集やサーバー再起動が反映されなくなる。Web Push の確認には SW が要るので、登録自体はやめない
 */
export function serviceWorkerUrl(nodeEnv: string | undefined = process.env.NODE_ENV): string {
  return nodeEnv === 'production' ? '/sw.js' : '/sw.js?dev=1'
}

export function ServiceWorkerRegistrar() {
  useEffect(() => {
    if ('serviceWorker' in navigator) {
      navigator.serviceWorker.register(serviceWorkerUrl()).catch((err) => {
        console.error('Service Worker registration failed:', err)
      })
    }
  }, [])

  return null
}
