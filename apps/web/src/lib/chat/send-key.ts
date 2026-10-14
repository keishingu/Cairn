export type ChatSendKeyMode = 'enter' | 'modifier-enter'

export function hasAppleTouchInput(platform: string, userAgent: string, maxTouchPoints: number): boolean {
  return /iPad|iPhone|iPod/i.test(userAgent) || ((platform === 'MacIntel' || platform === 'Macintosh') && maxTouchPoints > 1)
}

export function resolveChatSendKeyMode(value: string | null, hasTouchInput: boolean): ChatSendKeyMode {
  if (value === 'enter' || value === 'modifier-enter') return value
  return hasTouchInput ? 'modifier-enter' : 'enter'
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
