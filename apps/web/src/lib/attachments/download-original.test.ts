// Copyright 2026 Cairn Contributors
// SPDX-License-Identifier: Apache-2.0

import { describe, expect, it, vi } from 'vitest'
import { openFileDownload } from './download-original'

function fakeWindow(withBridge: boolean) {
  const postMessage = vi.fn()
  const open = vi.fn()
  const win = {
    open,
    document: { cookie: 'theme=dark; cairn_workspace_id=ws-1' },
    ...(withBridge ? { ReactNativeWebView: { postMessage } } : {}),
  } as unknown as Window
  return { win, postMessage, open }
}

describe('openFileDownload', () => {
  it('ブラウザでは API のパスを新しいタブで開く', () => {
    const { win, open, postMessage } = fakeWindow(false)
    openFileDownload('/api/attachments/f1?original=1', 'a.pdf', win)

    expect(open).toHaveBeenCalledWith('/api/attachments/f1?original=1', '_blank', 'noopener,noreferrer')
    expect(postMessage).not.toHaveBeenCalled()
  })

  it('アプリの WebView では開いているワークスペースを添えてアプリに保存を任せる', () => {
    const { win, open, postMessage } = fakeWindow(true)
    openFileDownload('/api/projects/p1/gallery/g1/file?original=1', 'IMG.JPG', win)

    expect(open).not.toHaveBeenCalled()
    expect(JSON.parse(postMessage.mock.calls[0]![0] as string)).toEqual({
      type: 'download-file',
      path: '/api/projects/p1/gallery/g1/file?original=1',
      fileName: 'IMG.JPG',
      workspaceId: 'ws-1',
    })
  })
})
