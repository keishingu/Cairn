export type ChatSendKeyMode = 'enter' | 'modifier-enter'

export function resolveChatSendKeyMode(value: string | null): ChatSendKeyMode {
  if (value === 'enter' || value === 'modifier-enter') return value
  return 'modifier-enter'
}

export function shouldSendChatOnEnter(
  key: string,
  mode: ChatSendKeyMode,
  modifiers: { shiftKey?: boolean; metaKey?: boolean; ctrlKey?: boolean } = {},
): boolean {
  if (key !== 'Enter' || modifiers.shiftKey) return false
  if (mode === 'modifier-enter') return !!(modifiers.metaKey || modifiers.ctrlKey)
  return !modifiers.metaKey && !modifiers.ctrlKey
}
