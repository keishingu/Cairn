// Copyright 2026 Cairn Contributors
// SPDX-License-Identifier: Apache-2.0

'use client'

import React from 'react'

const HEIC_ACCEPT = '.heic,.heif,image/heic,image/heif'

/**
 * ファイル選択ダイアログで HEIC を選べるようにした accept を返す（選んだ後は JPEG に変換して送る）。
 * iOS は accept に HEIC が無ければ写真を自動で JPEG にして渡してくれるため、そのままにする。
 * 端末側の変換のほうが速く確実で、HEIC を受け取ってブラウザ内で変換する理由がない。
 * サーバー描画と食い違わないよう、マウント後に切り替える。
 */
export function useHeicAccept(accept: string): string {
  const [withHeic, setWithHeic] = React.useState(false)
  React.useEffect(() => {
    setWithHeic(!isIosLike(navigator.userAgent, navigator.maxTouchPoints))
  }, [])
  return withHeic ? `${accept},${HEIC_ACCEPT}` : accept
}

/**
 * iPadOS 13 以降の Safari は既定で Mac の UA を名乗るため、UA だけでは iPad を見落とす。
 * Mac にはタッチ画面が無いので、Mac の UA で複数のタッチ点を持つ端末は iPad とみなす。
 */
export function isIosLike(userAgent: string, maxTouchPoints: number): boolean {
  if (/iPhone|iPad|iPod/.test(userAgent)) return true
  return /Macintosh/.test(userAgent) && maxTouchPoints > 1
}
