import { describe, expect, test } from 'vitest'
import { hasAppleTouchInput, resolveChatSendKeyMode, shouldSendChatOnEnter } from './send-key'

describe('チャットの送信キー', () => {
  test('未設定時はタッチ入力端末で複数行入力を既定にする', () => {
    expect(resolveChatSendKeyMode(null, true)).toBe('modifier-enter')
    expect(resolveChatSendKeyMode(null, false)).toBe('enter')
  })

  test('Appleのタッチ端末だけを安全既定の対象にする', () => {
    expect(hasAppleTouchInput('MacIntel', 'Mozilla/5.0 (Macintosh)', 5)).toBe(true)
    expect(hasAppleTouchInput('iPad', 'Mozilla/5.0 (iPad)', 0)).toBe(true)
    expect(hasAppleTouchInput('Win32', 'Mozilla/5.0 (Windows NT)', 10)).toBe(false)
    expect(hasAppleTouchInput('MacIntel', 'Mozilla/5.0 (Macintosh)', 0)).toBe(false)
  })

  test('保存済みの設定を端末既定より優先する', () => {
    expect(resolveChatSendKeyMode('enter', true)).toBe('enter')
    expect(resolveChatSendKeyMode('modifier-enter', false)).toBe('modifier-enter')
  })

  test('モードに応じて送信キーを判定し、モバイルとShift+Enterは改行する', () => {
    expect(shouldSendChatOnEnter('Enter', 'enter', false)).toBe(true)
    expect(shouldSendChatOnEnter('Enter', 'modifier-enter', false)).toBe(false)
    expect(shouldSendChatOnEnter('Enter', 'modifier-enter', false, { metaKey: true })).toBe(true)
    expect(shouldSendChatOnEnter('Enter', 'modifier-enter', false, { ctrlKey: true })).toBe(true)
    expect(shouldSendChatOnEnter('Enter', 'modifier-enter', true, { metaKey: true })).toBe(true)
    expect(shouldSendChatOnEnter('Enter', 'modifier-enter', true, { ctrlKey: true })).toBe(true)
    expect(shouldSendChatOnEnter('Enter', 'enter', true)).toBe(false)
    expect(shouldSendChatOnEnter('Enter', 'modifier-enter', true)).toBe(false)
    expect(shouldSendChatOnEnter('Enter', 'enter', false, { shiftKey: true })).toBe(false)
  })
})
