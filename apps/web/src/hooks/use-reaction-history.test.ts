// Copyright 2026 Cairn Contributors
// SPDX-License-Identifier: Apache-2.0

import { beforeEach, describe, expect, it } from 'vitest'
import { recordReactionHistory } from './use-reaction-history'

describe('最近使ったリアクションの記録', () => {
  beforeEach(() => localStorage.clear())

  it('使った絵文字をユーザー別に新しい順で保存する', () => {
    recordReactionHistory('user-1', '👍')
    recordReactionHistory('user-1', '🔥')
    recordReactionHistory('user-1', '👍')
    recordReactionHistory('user-2', '🎉')
    expect(JSON.parse(localStorage.getItem('cairn:reaction_history_user-1') ?? 'null')).toEqual(['👍', '🔥'])
    expect(JSON.parse(localStorage.getItem('cairn:reaction_history_user-2') ?? 'null')).toEqual(['🎉'])
  })

  it('保存済みの履歴が壊れていれば上書きせずに失敗する', () => {
    localStorage.setItem('cairn:reaction_history_user-1', '{broken')
    expect(() => recordReactionHistory('user-1', '👍')).toThrow()
    expect(localStorage.getItem('cairn:reaction_history_user-1')).toBe('{broken')
  })
})
