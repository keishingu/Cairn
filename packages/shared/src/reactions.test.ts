// Copyright 2026 Cairn Contributors
// SPDX-License-Identifier: Apache-2.0

import { describe, expect, it } from 'vitest'
import {
  DEFAULT_REACTIONS,
  filterReactionEmojis,
  isVerticalSheetDrag,
  nextReactionHistory,
  quickReactions,
  reactionSheetSwipe,
  type ReactionEmojiCatalog,
} from './reactions'

const catalog: ReactionEmojiCatalog = {
  categories: [
    { id: 'people', emojis: ['clap', 'smile'] },
    { id: 'symbols', emojis: ['heart'] },
  ],
  emojis: {
    clap: { id: 'clap', name: 'Clapping Hands', keywords: ['praise'], skins: [{ native: '👏' }, { native: '👏🏻' }] },
    smile: { id: 'smile', name: 'Smiling Face', keywords: ['happy'], skins: [{ native: '😄' }] },
    heart: { id: 'heart', name: 'Red Heart', keywords: ['love'], skins: [{ native: '❤️' }] },
  },
}

describe('最近のリアクション', () => {
  it('履歴を優先し、重複せず既定の絵文字で6件に補う', () => {
    expect(quickReactions([])).toEqual(DEFAULT_REACTIONS)
    expect(quickReactions(['🔥', '👍'])).toEqual(['🔥', '👍', '❤️', '😂', '🎉', '🙌'])
  })

  it('使った絵文字を先頭へ移す', () => {
    expect(nextReactionHistory(['👍', '🔥', '❤️'], '🔥')).toEqual(['🔥', '👍', '❤️'])
  })
})

describe('絵文字の絞り込み', () => {
  it('検索語がなければ選択中のカテゴリを返す', () => {
    expect(filterReactionEmojis(catalog, '', 'people', 0).map((item) => item.native)).toEqual(['👏', '😄'])
  })

  it('検索語があればカテゴリをまたいで英語名・キーワード・絵文字で探す', () => {
    expect(filterReactionEmojis(catalog, 'LOVE', 'people', 0).map((item) => item.native)).toEqual(['❤️'])
    expect(filterReactionEmojis(catalog, '👏', 'symbols', 0).map((item) => item.native)).toEqual(['👏'])
  })

  it('肌の色を反映し、色のない絵文字はそのまま返す', () => {
    expect(filterReactionEmojis(catalog, '', 'people', 1).map((item) => item.native)).toEqual(['👏🏻', '😄'])
  })
})

describe('リアクションシートのスワイプ判定', () => {
  it('たたんだ状態で上へ払うと全絵文字を開く', () => {
    expect(reactionSheetSwipe(-60, 0, false)).toBe('expand')
    expect(reactionSheetSwipe(-10, -0.8, false)).toBe('expand')
  })

  it('開いた状態で下へ払うとたたみ、たたんだ状態なら閉じる', () => {
    expect(reactionSheetSwipe(60, 0, true)).toBe('collapse')
    expect(reactionSheetSwipe(60, 0, false)).toBe('close')
  })

  it('動きが小さいとき・開いた状態で上へ払ったときは何もしない', () => {
    expect(reactionSheetSwipe(-20, -0.1, false)).toBeNull()
    expect(reactionSheetSwipe(20, 0.1, true)).toBeNull()
    expect(reactionSheetSwipe(-60, 0, true)).toBeNull()
  })

  it('横方向の動きやわずかな縦の動きはスワイプとして扱わない', () => {
    expect(isVerticalSheetDrag(30, 10)).toBe(false)
    expect(isVerticalSheetDrag(0, 5)).toBe(false)
    expect(isVerticalSheetDrag(3, 20)).toBe(true)
  })
})
