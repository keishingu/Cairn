import { describe, expect, it } from 'vitest'
import { emojiCategories, reactionEmojis } from './reaction-emoji-catalog'

describe('リアクションの絵文字一覧', () => {
  it('各カテゴリに選択可能な絵文字を表示する', () => {
    expect(emojiCategories.length).toBeGreaterThan(6)
    for (const category of emojiCategories)
      expect(reactionEmojis('', category.id, 0).length).toBeGreaterThan(0)
  })
  it('カテゴリをまたいで英語名と絵文字で検索する', () => {
    expect(reactionEmojis('HEART', 'flags', 0).some((item) => item.native === '❤️')).toBe(true)
    expect(reactionEmojis('🙏', 'foods', 0).some((item) => item.native === '🙏')).toBe(true)
    expect(reactionEmojis('not-an-emoji-name-xyz', 'people', 0)).toEqual([])
  })
  it('肌の色を切り替え、色のない絵文字はそのまま表示する', () => {
    expect(reactionEmojis('clap', 'people', 5).some((item) => item.native === '👏🏿')).toBe(true)
    expect(reactionEmojis('❤️', 'people', 5).some((item) => item.native === '❤️')).toBe(true)
  })
})
