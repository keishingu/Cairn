import { afterEach, describe, expect, test, vi } from 'vitest'
import { applyAppBadge, parseAppBadgeCount, shouldClearAppBadge } from './app-badge'

afterEach(() => {
  vi.restoreAllMocks()
})

describe('parseAppBadgeCount', () => {
  test('0 を含む件数をそのまま返す', () => {
    expect(parseAppBadgeCount({ count: 3 })).toBe(3)
    expect(parseAppBadgeCount({ count: 0 })).toBe(0)
  })

  test.each([[null], [{}], [{ count: '3' }], [{ count: -1 }], [{ count: 1.5 }]])(
    '不正な応答は 0 と見なさず失敗にする: %j',
    (body) => {
      expect(() => parseAppBadgeCount(body)).toThrow()
    },
  )
})

describe('shouldClearAppBadge', () => {
  test('サインアウトでは消す', () => {
    expect(shouldClearAppBadge('SIGNED_OUT', 'user-a', null)).toBe(true)
  })

  test('別ユーザーへ替わったら前のアカウントの数字を消す', () => {
    expect(shouldClearAppBadge('SIGNED_IN', 'user-a', 'user-b')).toBe(true)
  })

  test('起動時に未ログインならセッション切れで残った数字を消す', () => {
    expect(shouldClearAppBadge('INITIAL_SESSION', undefined, null)).toBe(true)
  })

  test('ログインのまま起動したときと同じユーザーの更新では消さない', () => {
    expect(shouldClearAppBadge('INITIAL_SESSION', undefined, 'user-a')).toBe(false)
    expect(shouldClearAppBadge('TOKEN_REFRESHED', 'user-a', 'user-a')).toBe(false)
    expect(shouldClearAppBadge('SIGNED_IN', null, 'user-a')).toBe(false)
  })
})

describe('applyAppBadge', () => {
  test('件数を OS へ渡す', async () => {
    const setBadgeCount = vi.fn().mockResolvedValue(true)

    await applyAppBadge(4, setBadgeCount)

    expect(setBadgeCount).toHaveBeenCalledWith(4)
  })

  test('端末がバッジに対応しない false はエラーにしない', async () => {
    const warn = vi.spyOn(console, 'warn').mockImplementation(() => undefined)

    await expect(applyAppBadge(4, vi.fn().mockResolvedValue(false))).resolves.toBeUndefined()

    expect(warn).not.toHaveBeenCalled()
  })

  test('反映に失敗しても画面を壊さず記録する', async () => {
    const warn = vi.spyOn(console, 'warn').mockImplementation(() => undefined)

    await expect(applyAppBadge(4, vi.fn().mockRejectedValue(new Error('native')))).resolves.toBeUndefined()

    expect(warn).toHaveBeenCalledOnce()
  })
})
