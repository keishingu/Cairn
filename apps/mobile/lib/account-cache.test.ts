import { describe, expect, it } from 'vitest'
import { isSessionConfirmedAbsent, shouldClearAccountCache } from './account-cache'

describe('shouldClearAccountCache', () => {
  it('サインアウトでは前のアカウントのキャッシュを捨てる', () => {
    expect(shouldClearAccountCache('SIGNED_OUT', 'user-a', null)).toBe(true)
  })

  it('別ユーザーへ替わったときだけ捨て、同じユーザーの更新では残す', () => {
    expect(shouldClearAccountCache('SIGNED_IN', 'user-a', 'user-b')).toBe(true)
    expect(shouldClearAccountCache('TOKEN_REFRESHED', 'user-a', 'user-a')).toBe(false)
    expect(shouldClearAccountCache('SIGNED_IN', null, 'user-b')).toBe(false)
  })
})

describe('isSessionConfirmedAbsent', () => {
  it('通信できたうえでセッションが無ければ確定する', () => {
    expect(isSessionConfirmedAbsent(false, false)).toBe(true)
  })

  it('通信できず更新に失敗しただけなら確定しない', () => {
    expect(isSessionConfirmedAbsent(false, true)).toBe(false)
  })

  it('セッションがあれば確定しない', () => {
    expect(isSessionConfirmedAbsent(true, false)).toBe(false)
  })
})
