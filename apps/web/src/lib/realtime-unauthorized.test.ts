import { describe, expect, it } from 'vitest'
import { isRealtimeUnauthorized } from './realtime-unauthorized'

describe('isRealtimeUnauthorized', () => {
  it('チャンネル topic の権限エラーを Unauthorized と判定する', () => {
    expect(isRealtimeUnauthorized({
      message: 'Unauthorized: You do not have permissions to read from this Channel topic: channel:1',
    })).toBe(true)
  })

  it('それ以外の失敗は Unauthorized にしない', () => {
    expect(isRealtimeUnauthorized({ message: 'boom' })).toBe(false)
    expect(isRealtimeUnauthorized(undefined)).toBe(false)
  })
})
