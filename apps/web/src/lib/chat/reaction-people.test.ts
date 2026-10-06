// Copyright 2026 Cairn Contributors
// SPDX-License-Identifier: Apache-2.0

import { describe, expect, it } from 'vitest'
import { summarizeReactionPeople } from './reaction-people'

describe('summarizeReactionPeople: リアクションした人の要約', () => {
  it('2人までは全員の名前を返す', () => {
    expect(summarizeReactionPeople([{ userNames: ['Alice', 'Bob'] }])).toEqual({ names: ['Alice', 'Bob'], restCount: 0 })
  })

  it('3人以上は先頭2人と残りの人数を返す', () => {
    expect(summarizeReactionPeople([{ userNames: ['Alice', 'Bob'] }, { userNames: ['Carol', 'Dave'] }]))
      .toEqual({ names: ['Alice', 'Bob'], restCount: 2 })
  })

  it('複数の絵文字を付けた人は1人に数える', () => {
    expect(summarizeReactionPeople([{ userNames: ['Alice', 'Bob'] }, { userNames: ['Bob', 'Carol'] }]))
      .toEqual({ names: ['Alice', 'Bob'], restCount: 1 })
  })

  it('名前が1件もなければ null を返す', () => {
    expect(summarizeReactionPeople([])).toBeNull()
    expect(summarizeReactionPeople([{ userNames: [] }])).toBeNull()
  })
})
