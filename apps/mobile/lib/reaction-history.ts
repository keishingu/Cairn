export const DEFAULT_REACTIONS = ['👍', '❤️', '😂', '🎉', '🙌', '👀']
const HISTORY_LIMIT = 32

export function parseReactionHistory(value: string | null): string[] {
  if (value === null) return []
  const parsed: unknown = JSON.parse(value)
  if (
    !Array.isArray(parsed) ||
    parsed.some((item) => typeof item !== 'string' || !item || item.length > 32)
  ) {
    throw new Error('Invalid reaction history')
  }
  return [...new Set(parsed as string[])].slice(0, HISTORY_LIMIT)
}

export function quickReactions(recent: readonly string[]): string[] {
  return [...new Set([...recent, ...DEFAULT_REACTIONS])].slice(0, 6)
}

type Storage = {
  getItem(key: string): Promise<string | null>
  setItem(key: string, value: string): Promise<void>
}

// Serialize read/modify/write across mounted channel screens to retain rapid selections.
export function createReactionHistoryStore(storage: Storage) {
  const pending = new Map<string, Promise<string[]>>()
  const key = (userId: string) => `cairn:reaction-history:${userId}`
  return {
    async read(userId: string) {
      return parseReactionHistory(await storage.getItem(key(userId)))
    },
    record(userId: string, emoji: string): Promise<string[]> {
      const previous = pending.get(userId) ?? Promise.resolve([])
      const task = previous
        .catch(() => [])
        .then(async () => {
          const recent = parseReactionHistory(await storage.getItem(key(userId)))
          const next = [emoji, ...recent.filter((item) => item !== emoji)].slice(0, HISTORY_LIMIT)
          await storage.setItem(key(userId), JSON.stringify(next))
          return next
        })
      pending.set(userId, task)
      void task
        .finally(() => {
          if (pending.get(userId) === task) pending.delete(userId)
        })
        .catch(() => {})
      return task
    },
  }
}

// Requests run concurrently; only history writes wait for earlier selections.
export function createReactionHistoryQueue() {
  let pending = Promise.resolve()
  return (request: Promise<{ added: boolean }>, record: () => Promise<void>) => {
    // Observe failures immediately, even while an earlier request is pending.
    const outcome = request.then(
      (value) => ({ value }),
      (error) => ({ error }),
    )
    const next = pending.then(async () => {
      const result = await outcome
      if ('error' in result) throw result.error
      if (result.value.added) await record()
    })
    pending = next.catch(() => {})
    return next
  }
}
