export type QueuedMessageStatus = 'waiting' | 'sending' | 'failed'

export interface QueuedMessage {
  id: string
  channelId: string
  content: string
  parentMessageId?: string
  attachmentFileIds?: string[]
  createdAt: string
  attempts: number
  status: QueuedMessageStatus
  lastError?: string
}

export function createClientMessageId(): string {
  return 'xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx'.replace(/[xy]/g, (token) => {
    const random = Math.floor(Math.random() * 16)
    const value = token === 'x' ? random : (random & 0x3) | 0x8
    return value.toString(16)
  })
}

export function isRetryableSendError(error: unknown): boolean {
  if (typeof error !== 'object' || error === null || !('status' in error)) return true
  const status = (error as { status?: unknown }).status
  return typeof status !== 'number' || status === 429 || status >= 500
}

export function parseStoredMessageQueue(raw: string | null): QueuedMessage[] {
  if (!raw) return []
  try {
    const parsed = JSON.parse(raw) as unknown
    if (!Array.isArray(parsed)) return []
    return parsed.flatMap((item): QueuedMessage[] => {
      if (
        typeof item !== 'object' ||
        item === null ||
        typeof (item as { id?: unknown }).id !== 'string' ||
        typeof (item as { channelId?: unknown }).channelId !== 'string' ||
        typeof (item as { content?: unknown }).content !== 'string' ||
        typeof (item as { createdAt?: unknown }).createdAt !== 'string'
      ) {
        return []
      }
      const value = item as QueuedMessage
      return [
        {
          ...value,
          attempts: typeof value.attempts === 'number' ? value.attempts : 0,
          // 送信中にアプリが終了した場合も次回起動で安全に再送する。
          status: value.status === 'failed' ? 'failed' : 'waiting',
        },
      ]
    })
  } catch {
    return []
  }
}
