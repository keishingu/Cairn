import type React from 'react'

type EnterEvent = React.KeyboardEvent<HTMLInputElement | HTMLTextAreaElement>

export function isImeConfirmingEnter(event: EnterEvent, isComposing: boolean): boolean {
  const nativeEvent = event.nativeEvent as KeyboardEvent & { isComposing?: boolean; keyCode?: number }
  return isComposing || nativeEvent.isComposing === true || nativeEvent.keyCode === 229
}
