// Copyright 2026 Cairn Contributors
// SPDX-License-Identifier: Apache-2.0

import { describe, expect, it } from 'vitest'
import { defaultThreadNameFromMessage, moveToThreadBodySchema } from './move-to-thread'

describe('切り出し先スレッド名の既定値', () => {
  it('改行と連続する空白を1つの半角スペースに畳んで前後を取り除く', () => {
    expect(defaultThreadNameFromMessage('  リリース\n\n日程の件　について\t相談 ')).toBe('リリース 日程の件 について 相談')
  })

  it('先頭30文字で切る', () => {
    expect(defaultThreadNameFromMessage('あ'.repeat(40))).toBe('あ'.repeat(30))
  })

  it('30文字ちょうどなら切らない', () => {
    expect(defaultThreadNameFromMessage('a'.repeat(30))).toBe('a'.repeat(30))
  })

  it('絵文字などのサロゲートペアを途中で割らずコードポイントで数える', () => {
    const name = defaultThreadNameFromMessage('😀'.repeat(31))
    expect(Array.from(name)).toHaveLength(30)
    expect(name).toBe('😀'.repeat(30))
  })

  it('切った末尾の空白は取り除く', () => {
    expect(defaultThreadNameFromMessage(`${'a'.repeat(29)} bbb`)).toBe('a'.repeat(29))
  })

  it('本文が空や空白だけなら空文字を返して入力を促す', () => {
    expect(defaultThreadNameFromMessage('')).toBe('')
    expect(defaultThreadNameFromMessage(' \n\t ')).toBe('')
  })
})

describe('スレッドへ切り出すリクエストの検証', () => {
  const id = '11111111-1111-4111-8111-111111111111'

  it('メッセージ指定と新規スレッド名の組み合わせを受け付ける', () => {
    expect(moveToThreadBodySchema.safeParse({ messageIds: [id], threadName: ' 相談 ' })).toMatchObject({
      success: true,
      data: { threadName: '相談' },
    })
  })

  it('以降すべてと既存スレッドの組み合わせを受け付ける', () => {
    expect(moveToThreadBodySchema.safeParse({ fromMessageId: id, threadId: id }).success).toBe(true)
  })

  it('範囲指定が無い、または両方ある場合は拒否する', () => {
    expect(moveToThreadBodySchema.safeParse({ threadName: 'a' }).success).toBe(false)
    expect(moveToThreadBodySchema.safeParse({ messageIds: [id], fromMessageId: id, threadName: 'a' }).success).toBe(false)
  })

  it('移動先が無い、または両方ある場合は拒否する', () => {
    expect(moveToThreadBodySchema.safeParse({ messageIds: [id] }).success).toBe(false)
    expect(moveToThreadBodySchema.safeParse({ messageIds: [id], threadId: id, threadName: 'a' }).success).toBe(false)
  })

  it('空のスレッド名と61文字以上のスレッド名は拒否する', () => {
    expect(moveToThreadBodySchema.safeParse({ messageIds: [id], threadName: '  ' }).success).toBe(false)
    expect(moveToThreadBodySchema.safeParse({ messageIds: [id], threadName: 'a'.repeat(61) }).success).toBe(false)
  })

  it('UUID 以外のメッセージ ID は拒否する', () => {
    expect(moveToThreadBodySchema.safeParse({ messageIds: ['x'], threadName: 'a' }).success).toBe(false)
  })
})
