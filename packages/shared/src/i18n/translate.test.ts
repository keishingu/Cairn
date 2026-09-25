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

  it('ピリオドやコロンを含む文をキーのまま引ける', () => {
    expect(translate('ja', 'Calendar: today')).toBe('カレンダー 今日へ')
    expect(translate('en', 'Adding...')).toBe('Adding...')
    expect(translate('ja', 'Adding...')).toBe('追加中…')
  })

  it('count は数値の差し込みで、複数形の別キーには分かれない', () => {
    expect(translate('en', '{count} photos', { count: 2 })).toBe('2 photos')
    expect(translate('ja', '{count} photos', { count: 0 })).toBe('0 枚')
    expect(translate('ja', '{count} photos', { count: 3 })).toBe('3 枚')
  })

  it('値が無いプレースホルダは残し、値の中の記号はそのまま出す', () => {
    expect(translate('en', 'Message {name}')).toBe('Message {name}')
    expect(translate('ja', 'Message {name}', { name: 'A & B <C>' })).toBe('A & B <C> にメッセージ送信')
  })
})
