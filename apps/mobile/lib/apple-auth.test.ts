import { describe, expect, it } from 'vitest'
import { getAppleDisplayName, isAppleAuthenticationCancelled } from './apple-auth'

describe('Apple認証の補助処理', () => {
  it('初回に返された氏名だけをプロフィール用の表示名へ整形する', () => {
    expect(
      getAppleDisplayName({
        namePrefix: null,
        givenName: '花子',
        middleName: null,
        familyName: '山田',
        nameSuffix: null,
        nickname: null,
      }),
    ).toBe('花子 山田')
  })

  it('氏名がない再ログインでは既存プロフィールを上書きしない', () => {
    expect(getAppleDisplayName(null)).toBeNull()
  })

  it('Appleのキャンセルを失敗として表示しない', () => {
    expect(isAppleAuthenticationCancelled({ code: 'ERR_REQUEST_CANCELED' })).toBe(true)
    expect(isAppleAuthenticationCancelled({ code: 'ERR_REQUEST_FAILED' })).toBe(false)
  })
})
