// Copyright 2026 Cairn Contributors
// SPDX-License-Identifier: Apache-2.0

import { describe, expect, it } from 'vitest'
import { encodeAiMemberMentions, memberMentionTrigger } from './ai-member-mentions'

describe('memberMentionTrigger', () => {
  it('行頭や空白の後の @ と、日本語入力の全角 ＠ で候補を開く', () => {
    expect(memberMentionTrigger('@やま', 3)).toEqual({ query: 'やま', start: 0 })
    expect(memberMentionTrigger('担当は ＠やま', 7)).toEqual({ query: 'やま', start: 4 })
  })

  it('メールアドレスの途中や、空白を打った後は候補を開かない', () => {
    expect(memberMentionTrigger('a@example', 9)).toBeNull()
    expect(memberMentionTrigger('@やま ', 4)).toBeNull()
  })
})

describe('encodeAiMemberMentions', () => {
  it('ピッカーで入れた @表示名 を名前付きの記法にする', () => {
    expect(encodeAiMemberMentions('@山田 太郎 の担当を教えて', [{ tokenId: 'user-1', displayName: '山田 太郎' }]))
      .toBe('<@user-1|山田 太郎> の担当を教えて')
  })

  it('ピッカーを使わずに打った @名前 はそのまま送る', () => {
    expect(encodeAiMemberMentions('@山田 の担当を教えて', [])).toBe('@山田 の担当を教えて')
  })
})
