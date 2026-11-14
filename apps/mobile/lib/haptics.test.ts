import { afterEach, describe, expect, test, vi } from 'vitest'
import { createHaptics, haptics, type HapticFeedback } from './haptics'

afterEach(() => {
  vi.restoreAllMocks()
})

// 非同期の再生と失敗処理が終わるまで待つ
const flush = () => new Promise((resolve) => setTimeout(resolve, 0))

describe('createHaptics', () => {
  test('用途ごとに決めた種類の振動を鳴らす', async () => {
    const played: HapticFeedback[] = []
    const target = createHaptics(() => async (feedback) => {
      played.push(feedback)
    })

    target.longPressMenu()
    target.reactionAdded()
    target.messageSent()
    target.sendFailed()
    target.swipeReplyThreshold()
    target.refreshStart()
    await flush()

    expect(played).toEqual(['impactLight', 'selection', 'success', 'error', 'impactLight', 'selection'])
  })

  test('振動の読み込みは最初の1回だけ行う', async () => {
    const load = vi.fn(() => async () => {})
    const target = createHaptics(load)

    target.messageSent()
    target.sendFailed()
    await flush()

    expect(load).toHaveBeenCalledTimes(1)
  })

  test('対応しない環境では何も鳴らさない', async () => {
    const warn = vi.spyOn(console, 'warn').mockImplementation(() => {})

    createHaptics(() => null).messageSent()
    await flush()

    expect(warn).not.toHaveBeenCalled()
  })

  test('再生に失敗しても例外を投げず、警告だけ残す', async () => {
    const warn = vi.spyOn(console, 'warn').mockImplementation(() => {})
    const target = createHaptics(() => () => Promise.reject(new Error('unavailable')))

    expect(() => target.sendFailed()).not.toThrow()
    await flush()

    expect(warn).toHaveBeenCalledTimes(1)
  })

  test('読み込みに失敗しても例外を投げず、以後は読み込み直さない', async () => {
    const warn = vi.spyOn(console, 'warn').mockImplementation(() => {})
    const load = vi.fn((): null => {
      throw new Error('native module is missing')
    })
    const target = createHaptics(load)

    expect(() => {
      target.messageSent()
      target.messageSent()
    }).not.toThrow()
    await flush()

    expect(load).toHaveBeenCalledTimes(1)
    expect(warn).toHaveBeenCalledTimes(1)
  })
})

describe('haptics', () => {
  test('テスト環境では react-native を読み込まず何もしない', async () => {
    const warn = vi.spyOn(console, 'warn').mockImplementation(() => {})

    haptics.messageSent()
    await flush()

    expect(warn).not.toHaveBeenCalled()
  })
})
