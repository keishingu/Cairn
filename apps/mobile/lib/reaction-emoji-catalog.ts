import data from '@emoji-mart/data'
import type { EmojiMartData } from '@emoji-mart/data'

const catalog = data as EmojiMartData
export const emojiCategories = catalog.categories

export function reactionEmojis(search: string, category: string, tone: number) {
  const query = search.trim().toLowerCase()
  const ids = query
    ? Object.keys(catalog.emojis)
    : (emojiCategories.find((item) => item.id === category)?.emojis ?? [])
  return ids.flatMap((id) => {
    const emoji = catalog.emojis[id]
    if (!emoji) return []
    const words = [
      emoji.id,
      emoji.name,
      ...emoji.keywords,
      ...emoji.skins.map((skin) => skin.native),
    ]
    if (query && !words.join(' ').toLowerCase().includes(query)) return []
    const skin = emoji.skins[tone] ?? emoji.skins[0]
    return skin ? [{ id, name: emoji.name, native: skin.native }] : []
  })
}
