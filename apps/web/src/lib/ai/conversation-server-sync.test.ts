// Copyright 2026 Cairn Contributors
// SPDX-License-Identifier: Apache-2.0

import { describe, expect, test } from 'vitest'
import { ConversationServerSync } from './conversation-server-sync'

describe('会話をサーバーの内容で置き換えてよいかの判定', () => {
  test('送った依頼が保存された会話に入るまで置き換えず、入ったら置き換える', () => {
    const sync = new ConversationServerSync()
    sync.sent('q1')
    expect(sync.decide(['old'], sync.begin(), false)).toBe('waiting')
    expect(sync.decide(['old', 'q1', 'a1'], sync.begin(), false)).toBe('apply')
    expect(sync.isAwaiting('q1')).toBe(false)
  })

  test('応答を受信している途中は置き換えない', () => {
    const sync = new ConversationServerSync()
    expect(sync.decide([], sync.begin(), true)).toBe('waiting')
  })

  test('続けて送ったとき、前の依頼だけが保存された会話では置き換えず、後の依頼の保存を待つ', () => {
    const sync = new ConversationServerSync()
    sync.sent('q1')
    sync.sent('q2')
    expect(sync.decide(['q1', 'a1'], sync.begin(), false)).toBe('waiting')
    expect(sync.isAwaiting('q1')).toBe(false)
    expect(sync.isAwaiting('q2')).toBe(true)
    expect(sync.decide(['q1', 'a1', 'q2', 'a2'], sync.begin(), false)).toBe('apply')
  })

  test('送信に失敗した依頼は待たず、手元にだけ残った依頼があってもサーバーの内容で置き換える', () => {
    const sync = new ConversationServerSync()
    sync.sent('failed')
    sync.abandoned('failed')
    sync.sent('q2')
    expect(sync.decide(['q2', 'a2'], sync.begin(), false)).toBe('apply')
  })

  test('保存されなかった依頼を待つのをやめても、続けて送った依頼は引き続き待つ', () => {
    const sync = new ConversationServerSync()
    sync.sent('q1')
    sync.sent('q2')
    sync.abandoned('q1')
    expect(sync.decide([], sync.begin(), false)).toBe('waiting')
    expect(sync.decide(['q2', 'a2'], sync.begin(), false)).toBe('apply')
  })

  test('新しい取り直しを反映した後に届いた、それより前に始めた取り直しの結果は捨てる', () => {
    const sync = new ConversationServerSync()
    const older = sync.begin()
    const newer = sync.begin()
    expect(sync.decide(['q1', 'a1', 'q2', 'a2'], newer, false)).toBe('apply')
    expect(sync.decide(['q1', 'a1'], older, false)).toBe('stale')
  })

  test('前に始めた取り直しが先に返ったときは、そのまま反映してよい', () => {
    const sync = new ConversationServerSync()
    const older = sync.begin()
    const newer = sync.begin()
    expect(sync.decide(['q1', 'a1'], older, false)).toBe('apply')
    expect(sync.decide(['q1', 'a1', 'q2', 'a2'], newer, false)).toBe('apply')
  })
})
