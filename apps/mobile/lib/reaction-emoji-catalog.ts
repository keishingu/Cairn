import data from '@emoji-mart/data'
import type { EmojiMartData } from '@emoji-mart/data'
import { filterReactionEmojis } from '@cairn/shared'

const catalog = data as EmojiMartData
export const emojiCategories = catalog.categories

export function reactionEmojis(search: string, category: string, tone: number) {
  return filterReactionEmojis(catalog, search, category, tone)
}
