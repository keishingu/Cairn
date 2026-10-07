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
    setWithHeic(!/iPhone|iPad|iPod/.test(navigator.userAgent))
  }, [])
  return withHeic ? `${accept},${HEIC_ACCEPT}` : accept
}
