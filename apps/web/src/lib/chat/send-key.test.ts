import { describe, expect, test } from 'vitest'
import { resolveChatSendKeyMode, shouldSendChatOnEnter } from './send-key'

describe('チャットの送信キー', () => {
  test('全端末で未設定時はEnterで改行する', () => {
    expect(resolveChatSendKeyMode(null)).toBe('modifier-enter')
  })

  test('保存済みの設定を端末既定より優先する', () => {
    expect(resolveChatSendKeyMode('enter')).toBe('enter')
    expect(resolveChatSendKeyMode('modifier-enter')).toBe('modifier-enter')
  })

  test('どちらのモードでも修飾Enterは送信し、Shift+Enterは改行する', () => {
    expect(shouldSendChatOnEnter('Enter', 'enter')).toBe(true)
    expect(shouldSendChatOnEnter('Enter', 'modifier-enter')).toBe(false)
    expect(shouldSendChatOnEnter('Enter', 'enter', { metaKey: true })).toBe(true)
    expect(shouldSendChatOnEnter('Enter', 'enter', { ctrlKey: true })).toBe(true)
    expect(shouldSendChatOnEnter('Enter', 'modifier-enter', { metaKey: true })).toBe(true)
    expect(shouldSendChatOnEnter('Enter', 'modifier-enter', { ctrlKey: true })).toBe(true)
    expect(shouldSendChatOnEnter('Enter', 'enter', { shiftKey: true })).toBe(false)
    expect(shouldSendChatOnEnter('Enter', 'modifier-enter', { shiftKey: true })).toBe(false)
    expect(shouldSendChatOnEnter('Enter', 'enter', { shiftKey: true, metaKey: true })).toBe(false)
    expect(shouldSendChatOnEnter('Enter', 'modifier-enter', { shiftKey: true, ctrlKey: true })).toBe(false)
  })
})
