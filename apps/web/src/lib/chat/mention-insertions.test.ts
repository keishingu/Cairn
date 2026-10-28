// Copyright 2026 Cairn Contributors
// SPDX-License-Identifier: Apache-2.0

import { describe, expect, it } from 'vitest'
import { encodeInsertedMentions } from './mention-insertions'

describe('encodeInsertedMentions', () => {
  it('同名の2人は挿入順に先頭から1件ずつ置き換える', () => {
    const insertions = [
      { tokenId: 'user-a', displayName: '小川聡' },
      { tokenId: 'user-b', displayName: '小川聡' },
    ]
    expect(encodeInsertedMentions('@小川聡 と @小川聡 に確認', insertions, ({ tokenId }) => `<@${tokenId}>`))
      .toBe('<@user-a> と <@user-b> に確認')
  })

  it('消した @表示名 や、名前の続きがある文字は置き換えない', () => {
    const insertions = [{ tokenId: 'user-a', displayName: '小川聡' }]
    expect(encodeInsertedMentions('@小川聡太 に確認', insertions, ({ tokenId }) => `<@${tokenId}>`)).toBe('@小川聡太 に確認')
  })

  it('表示名に $ を含んでも置換パターンとして解釈しない', () => {
    const insertions = [{ tokenId: 'user-a', displayName: 'a$&b' }]
    expect(encodeInsertedMentions('@a$&b さん', insertions, ({ tokenId, displayName }) => `<@${tokenId}|${displayName}>`))
      .toBe('<@user-a|a$&b> さん')
  })
})
