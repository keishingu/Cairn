// Copyright 2026 Cairn Contributors
// SPDX-License-Identifier: Apache-2.0

import { WORKSPACE_COOKIE } from '@/lib/workspace-cookie'

export const NATIVE_DOWNLOAD_FILE_MESSAGE_TYPE = 'download-file'

type NativeBridgeWindow = Window & {
  ReactNativeWebView?: { postMessage: (message: string) => void }
}

function currentWorkspaceId(cookie: string): string | null {
  const entry = cookie.split('; ').find((part) => part.startsWith(`${WORKSPACE_COOKIE}=`))
  return entry ? decodeURIComponent(entry.slice(WORKSPACE_COOKIE.length + 1)) : null
}

/**
 * 原本など API 経由のファイルを保存する。ブラウザでは新しいタブで開き（API が署名 URL へ転送する）、
 * アプリの WebView では window.open が使えないため、アプリに取得と OS の共有シートを任せる。
 * アプリは WebView と別にワークスペースを選んでいるため、Web が開いているワークスペースを渡す
 */
export function openFileDownload(path: string, fileName: string, win: Window = window): void {
  const bridge = (win as NativeBridgeWindow).ReactNativeWebView
  if (bridge) {
    bridge.postMessage(
      JSON.stringify({
        type: NATIVE_DOWNLOAD_FILE_MESSAGE_TYPE,
        path,
        fileName,
        workspaceId: currentWorkspaceId(win.document.cookie),
      }),
    )
    return
  }
  win.open(path, '_blank', 'noopener,noreferrer')
}
