import AsyncStorage from '@react-native-async-storage/async-storage'

// オフライン送信キュー。送信前のメッセージを AsyncStorage に永続化し、
// アプリ再起動・電波回復後も再送できるようにする（docs/archive/prompts/phase2b-5-native-chat.md）

export interface QueuedMessage {
  tempId: string
  channelId: string
  content: string
  attachmentFileIds: string[]
  createdAt: string
  attempts: number
  status: 'pending' | 'failed'
}

const STORAGE_KEY = 'cairn:message_queue'

// 無限リトライを避ける。上限到達後は「タップして再送」のユーザー操作でのみ再試行する
export const MAX_ATTEMPTS = 3

export function createTempId(): string {
  return `tmp-${Date.now()}-${Math.random().toString(36).slice(2, 10)}`
}

async function readAll(): Promise<QueuedMessage[]> {
  const raw = await AsyncStorage.getItem(STORAGE_KEY)
  if (!raw) return []
  try {
    return JSON.parse(raw) as QueuedMessage[]
  } catch {
    // 壊れたデータは破棄する（読めないキューを残しても再送できない）
    await AsyncStorage.removeItem(STORAGE_KEY)
    return []
  }
}

async function writeAll(queue: QueuedMessage[]): Promise<void> {
  await AsyncStorage.setItem(STORAGE_KEY, JSON.stringify(queue))
}

export async function getAll(channelId?: string): Promise<QueuedMessage[]> {
  const all = await readAll()
  return channelId ? all.filter(m => m.channelId === channelId) : all
}

export async function enqueue(
  msg: Omit<QueuedMessage, 'attempts' | 'status'>,
): Promise<QueuedMessage> {
  const queued: QueuedMessage = { ...msg, attempts: 0, status: 'pending' }
  const all = await readAll()
  await writeAll([...all, queued])
  return queued
}

export async function update(
  tempId: string,
  patch: Partial<Pick<QueuedMessage, 'attempts' | 'status'>>,
): Promise<void> {
  const all = await readAll()
  await writeAll(all.map(m => (m.tempId === tempId ? { ...m, ...patch } : m)))
}

export async function remove(tempId: string): Promise<void> {
  const all = await readAll()
  await writeAll(all.filter(m => m.tempId !== tempId))
}
