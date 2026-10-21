import { describe, expect, test } from 'vitest'
import { pushPermissionView } from './push-permission'

describe('pushPermissionView', () => {
  test('許可済みならオン表示にする', () => {
    expect(pushPermissionView({ status: 'granted', granted: true, canAskAgain: true })).toBe('granted')
    expect(pushPermissionView({ status: 'granted', granted: true, canAskAgain: false })).toBe('granted')
  })

  test('未許可でまだダイアログを出せるなら許可を求める', () => {
    expect(pushPermissionView({ status: 'undetermined', granted: false, canAskAgain: true })).toBe('request')
    expect(pushPermissionView({ status: 'denied', granted: false, canAskAgain: true })).toBe('request')
  })

  test('拒否済みでダイアログを出せないなら設定アプリへ案内する', () => {
    expect(pushPermissionView({ status: 'denied', granted: false, canAskAgain: false })).toBe('open-settings')
  })

  test('実行時権限は許可済みでも端末設定で通知がオフなら設定アプリへ案内する', () => {
    expect(pushPermissionView({ status: 'denied', granted: true, canAskAgain: true })).toBe('open-settings')
  })
})
