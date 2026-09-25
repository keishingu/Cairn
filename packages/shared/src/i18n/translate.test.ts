import { describe, expect, it } from 'vitest'
import { translate } from './translate'

describe('translate', () => {
  it('英語の UI 文をそのまま返し、日本語はカタログを使う', () => {
    expect(translate('en', 'Sign in')).toBe('Sign in')
    expect(translate('ja', 'Sign in')).toBe('サインイン')
    expect(translate('ja', 'Sign in with Google')).toBe('Google でサインイン')
  })

  it('未登録のキーは英語のまま残す', () => {
    expect(translate('ja', 'Not in the catalog yet')).toBe('Not in the catalog yet')
  })

  it('プレースホルダを差し替える', () => {
    expect(translate('en', 'Message {name}', { name: 'general' })).toBe('Message general')
    expect(translate('ja', 'Message {name}', { name: 'general' })).toBe('general にメッセージ送信')
  })
})
