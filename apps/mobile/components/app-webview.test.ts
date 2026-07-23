import { describe, expect, it } from 'vitest'
import { webPath } from '../lib/webview-path'

describe('アプリ内WebViewのパス変換', () => {
  it('webview=1 を相対パスへ付与する', () => {
    expect(webPath('/ai')).toBe('/ai?webview=1')
  })

  it('既存クエリを保ったまま webview=1 を追加する', () => {
    expect(webPath('/projects?open=p1')).toBe('/projects?open=p1&webview=1')
  })
})
