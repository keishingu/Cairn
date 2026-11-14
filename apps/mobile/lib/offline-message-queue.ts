export type QueuedMessageStatus = 'waiting' | 'sending' | 'failed'

export interface QueuedMessage {
  id: string
  channelId: string
  // 旧版の保存項目には存在しない。所属先を推測して送信しない。
  workspaceId?: string
  content: string
  mentionNames?: Record<string, string>
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

export async function persistThenStartSend(
  persist: () => Promise<void>,
  startSend: () => void,
): Promise<void> {
  await persist()
  startSend()
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

/** 保存後にセッションが切り替わっていても、別アカウントで本文を送らない。 */
export async function sendQueuedForUser<TSession extends { user: { id: string } }, TResult>(
  userId: string,
  isCurrentAccount: () => boolean,
  getSession: () => Promise<TSession | null>,
  send: (session: TSession) => Promise<TResult>,
): Promise<TResult | null> {
  if (!isCurrentAccount()) return null
  const session = await getSession()
  if (!isCurrentAccount() || session?.user.id !== userId) return null
  return send(session)
}

/** 所属先不明の旧項目は元のチャンネルで復旧できるよう返す。 */
export function messagesForWorkspace(messages: QueuedMessage[], workspaceId: string | null | undefined): QueuedMessage[] {
  return workspaceId ? messages.filter((message) => !message.workspaceId || message.workspaceId === workspaceId) : []
}

/** ワークスペースが確定している待機項目だけを送信する。 */
export function pendingMessages(messages: QueuedMessage[]): QueuedMessage[] {
  return messages.filter((message) => typeof message.workspaceId === 'string' && message.workspaceId.length > 0 && message.status === 'waiting')
}

/** 明示的な再送時だけ旧項目を現在のワークスペースへ紐付ける。 */
export function retryQueuedMessage(message: QueuedMessage, workspaceId: string): QueuedMessage | null {
  if (message.workspaceId && message.workspaceId !== workspaceId) return null
  const { lastError: _lastError, ...rest } = message
  return { ...rest, workspaceId, status: 'waiting' }
}

/** 選択取得中・保存待ち中の切替を検出し、古い画面での紐付けを拒否する。 */
export function canRetryInWorkspace(workspaceId: string, selected: string | null, generation: number, currentGeneration: number): boolean {
  return generation === currentGeneration && (!selected || selected === workspaceId)
}

/** 保存済み選択を優先し、初回の未選択時だけ API が返す既定先を使う。 */
export function resolveQueueWorkspace(ready: boolean, selectedWorkspaceId: string | null, defaultWorkspaceId: string | undefined): string | undefined {
  if (!ready) return undefined
  return selectedWorkspaceId || defaultWorkspaceId
}

/** 保存済みキューと選択先の両方が復元できるよう、エラーと再試行をまとめる。 */
export function queueRestoreControls(
  queueError: string | null,
  selectionError: Error | null,
  selectionErrorMessage: string,
  retryQueue: () => void,
  retrySelection: () => void,
): { error: string | null; retry: () => void } {
  return {
    error: queueError ?? (selectionError ? selectionErrorMessage : null),
    retry: () => { retrySelection(); retryQueue() },
  }
}
