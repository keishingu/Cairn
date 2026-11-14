// Copyright 2026 Cairn Contributors
// SPDX-License-Identifier: Apache-2.0

import { describe, expect, it } from 'vitest'
import { buildMoveToThreadBody, canMoveMessageToThread, defaultMoveThreadName } from './move-to-thread'

const msg = (id: string, content: string, createdAt: string) => ({ id, content, createdAt })

describe('スレッドに切り出す導線の表示条件', () => {
  it('親ワークスペースチャンネルの通常メッセージは member 以上に出す', () => {
    for (const role of ['owner', 'admin', 'member']) {
      expect(canMoveMessageToThread({ isParentWorkspaceChannel: true, role, messageType: 'text' })).toBe(true)
    }
    expect(canMoveMessageToThread({ isParentWorkspaceChannel: true, role: 'member', messageType: 'html' })).toBe(true)
  })

  it('ゲストとロール未解決の間は出さない', () => {
    expect(canMoveMessageToThread({ isParentWorkspaceChannel: true, role: 'guest', messageType: 'text' })).toBe(false)
    expect(canMoveMessageToThread({ isParentWorkspaceChannel: true, role: undefined, messageType: 'text' })).toBe(false)
  })

  it('システムメッセージには出さない', () => {
    expect(canMoveMessageToThread({ isParentWorkspaceChannel: true, role: 'admin', messageType: 'system' })).toBe(false)
  })

  it('スレッド・プロジェクト・DM など親ワークスペースチャンネル以外では出さない', () => {
    expect(canMoveMessageToThread({ isParentWorkspaceChannel: false, role: 'admin', messageType: 'text' })).toBe(false)
  })
})

describe('切り出し時のスレッド名の既定値', () => {
  const first = msg('a', '最初の\n発言です', '2026-01-01T00:00:00Z')

  it('単体・以降すべてでは起点メッセージの本文から作る', () => {
    expect(defaultMoveThreadName('single', first, [])).toBe('最初の 発言です')
    expect(defaultMoveThreadName('after', first, [])).toBe('最初の 発言です')
  })

  it('選択した複数メッセージでは最も古いメッセージの本文から作る', () => {
    const selected = [msg('c', '三つ目', '2026-01-01T00:03:00Z'), msg('b', '二つ目', '2026-01-01T00:02:00Z')]
    expect(defaultMoveThreadName('selected', first, selected)).toBe('二つ目')
  })

  it('本文が空なら空文字にして入力を促す', () => {
    expect(defaultMoveThreadName('single', msg('a', '', '2026-01-01T00:00:00Z'), [])).toBe('')
  })
})

describe('切り出しリクエストの組み立て', () => {
  it('以降すべては fromMessageId で送る', () => {
    expect(buildMoveToThreadBody({ scope: 'after', anchorId: 'a', selectedIds: [], destination: { kind: 'new', name: ' 相談 ' } }))
      .toEqual({ fromMessageId: 'a', threadName: '相談' })
  })

  it('このメッセージだけは起点1件の messageIds で送る', () => {
    expect(buildMoveToThreadBody({ scope: 'single', anchorId: 'a', selectedIds: ['x'], destination: { kind: 'existing', threadId: 't' } }))
      .toEqual({ messageIds: ['a'], threadId: 't' })
  })

  it('選択したメッセージは選択中の ID をすべて送る', () => {
    expect(buildMoveToThreadBody({ scope: 'selected', anchorId: 'a', selectedIds: ['a', 'b'], destination: { kind: 'new', name: 'x' } }))
      .toEqual({ messageIds: ['a', 'b'], threadName: 'x' })
  })
})
