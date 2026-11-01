// Copyright 2026 Cairn Contributors
// SPDX-License-Identifier: Apache-2.0

import React from 'react'
import { useSearchParams } from 'next/navigation'

type RequestStorage = Pick<Storage, 'getItem' | 'setItem'>

/**
 * URL の一度きりの指示（アプリのクイックアクション）を実行してよいか判定し、実行済みとして記録する。
 * アプリは押すたびに変わる open を付ける。URL はアプリのタブに残り、WebView を作り直すと同じ URL が再び読み込まれるため、
 * ページをまたいで残る記録で同じ open を実行しない。open が無い URL は記録できないので毎回実行する。
 * 記録を読み書きできない環境では、指示を無視せず実行する。
 */
export function claimOneShotRequest(storage: RequestStorage, storageKey: string, open: string | null): boolean {
  if (!open) return true
  try {
    if (storage.getItem(storageKey) === open) return false
    storage.setItem(storageKey, open)
  } catch (error) {
    console.warn('[one-shot-request] 実行済みの記録を読み書きできませんでした', error)
  }
  return true
}

/** ?{param}=1 の指示を 1 回だけ実行する */
export function useOneShotRequest(param: string, onRequest: () => void): void {
  const searchParams = useSearchParams()
  const handledRef = React.useRef<string | null>(null)
  const onRequestRef = React.useRef(onRequest)
  React.useEffect(() => {
    onRequestRef.current = onRequest
  })

  React.useEffect(() => {
    const requestKey = searchParams.toString()
    if (searchParams.get(param) !== '1' || handledRef.current === requestKey) return
    handledRef.current = requestKey
    if (claimOneShotRequest(window.localStorage, `cairn:one_shot_request:${param}`, searchParams.get('open'))) {
      onRequestRef.current()
    }
  }, [param, searchParams])
}
