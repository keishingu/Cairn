export const CHAT_SEND_ON_ENTER_STORAGE_KEY = 'cairn:chat_send_on_enter_mobile'

export interface ChatSendKeyStorage {
  getItem(key: string): Promise<string | null>
  setItem(key: string, value: string): Promise<void>
}

export function readChatSendOnEnter(value: string | null): boolean {
  return value === 'true'
}

export async function loadChatSendOnEnter(storage: ChatSendKeyStorage): Promise<boolean> {
  return readChatSendOnEnter(await storage.getItem(CHAT_SEND_ON_ENTER_STORAGE_KEY))
}

export async function saveChatSendOnEnter(enabled: boolean, storage: ChatSendKeyStorage): Promise<void> {
  await storage.setItem(CHAT_SEND_ON_ENTER_STORAGE_KEY, String(enabled))
}

export function chatInputSubmitBehavior(sendOnEnter: boolean, editingMessage: boolean): 'submit' | 'newline' {
  return sendOnEnter && !editingMessage ? 'submit' : 'newline'
}
