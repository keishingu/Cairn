import { afterEach, describe, expect, test, vi } from 'vitest'
import { withTimeout } from './with-timeout'

describe('withTimeout', () => {
  afterEach(() => {
    vi.useRealTimers()
  })

  test('時間内に終わればその結果を返す', async () => {
    await expect(withTimeout(Promise.resolve('ok'), 1000, 'timed out')).resolves.toBe('ok')
  })

  test('時間内に終わらなければ失敗にする', async () => {
    vi.useFakeTimers()
    const pending = withTimeout(new Promise<never>(() => undefined), 1000, 'timed out')
    vi.advanceTimersByTime(1000)
    await expect(pending).rejects.toThrow('timed out')
  })

  test('元の失敗はそのまま返す', async () => {
    await expect(withTimeout(Promise.reject(new Error('boom')), 1000, 'timed out')).rejects.toThrow('boom')
  })
})
