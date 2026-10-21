import { describe, expect, test } from 'vitest'
import { pushPermissionView } from './push-permission'

describe('pushPermissionView', () => {
  test('許可済みならオン表示にする', () => {
    expect(pushPermissionView({ granted: true, canAskAgain: true })).toBe('granted')
    expect(pushPermissionView({ granted: true, canAskAgain: false })).toBe('granted')
  })

  test('未許可でまだダイアログを出せるなら許可を求める', () => {
    expect(pushPermissionView({ granted: false, canAskAgain: true })).toBe('request')
  })

  test('拒否済みでダイアログを出せないなら設定アプリへ案内する', () => {
    expect(pushPermissionView({ granted: false, canAskAgain: false })).toBe('open-settings')
  })
})
