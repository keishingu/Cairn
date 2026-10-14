'use client'

import * as React from 'react'
import { useT } from '@/components/locale-provider'
import { STORAGE_KEYS } from '@/lib/storage-keys'
import { resolveChatSendKeyMode, type ChatSendKeyMode } from '@/lib/chat/send-key'

export const CHAT_SEND_KEY_CHANGED_EVENT = 'cairn:chat-send-key-changed'

export function useChatSendKeyMode() {
  const t = useT()
  const [mode, setMode] = React.useState<ChatSendKeyMode>('modifier-enter')
  const [error, setError] = React.useState<string | null>(null)

  React.useEffect(() => {
    const readPreference = () => {
      try {
        setMode(resolveChatSendKeyMode(localStorage.getItem(STORAGE_KEYS.chat_send_key)))
        setError(null)
      } catch {
        setMode('modifier-enter')
        setError(t('Could not read the chat input preference from this browser.'))
      }
    }
    const handleStorage = (event: StorageEvent) => {
      if (event.key === null || event.key === STORAGE_KEYS.chat_send_key) readPreference()
    }

    readPreference()
    window.addEventListener(CHAT_SEND_KEY_CHANGED_EVENT, readPreference)
    window.addEventListener('storage', handleStorage)
    return () => {
      window.removeEventListener(CHAT_SEND_KEY_CHANGED_EVENT, readPreference)
      window.removeEventListener('storage', handleStorage)
    }
  }, [t])

  const toggle = React.useCallback(() => {
    const nextMode = mode === 'enter' ? 'modifier-enter' : 'enter'
    try {
      localStorage.setItem(STORAGE_KEYS.chat_send_key, nextMode)
      window.dispatchEvent(new Event(CHAT_SEND_KEY_CHANGED_EVENT))
    } catch {
      setError(t('Could not save the chat input preference in this browser.'))
    }
  }, [mode, t])

  return { mode, error, dismissError: () => setError(null), toggle }
}
