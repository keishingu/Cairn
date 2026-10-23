import { describe, expect, it } from 'vitest'
import {
  beginPostAuthNavigation,
  completePostAuthNavigation,
  isPostAuthNavigationPending,
} from './auth-navigation'

describe('OAuth後の遷移制御', () => {
  it('認証完了後の行き先が決まるまで既定リダイレクトを保留する', () => {
    completePostAuthNavigation()
    beginPostAuthNavigation()
    expect(isPostAuthNavigationPending()).toBe(true)

    completePostAuthNavigation()
    expect(isPostAuthNavigationPending()).toBe(false)
  })
})
