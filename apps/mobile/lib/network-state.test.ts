import { describe, expect, it } from 'vitest'
import { shouldAttemptNetworkRequest } from './network-state'

describe('端末ネットワーク状態', () => {
  it('圏外またはインターネット到達不可なら送信を待機する', () => {
    expect(shouldAttemptNetworkRequest({ isConnected: false })).toBe(false)
    expect(shouldAttemptNetworkRequest({ isConnected: true, isInternetReachable: false })).toBe(
      false,
    )
  })

  it('到達可能または判定前なら送信を試す', () => {
    expect(shouldAttemptNetworkRequest({ isConnected: true, isInternetReachable: true })).toBe(true)
    expect(shouldAttemptNetworkRequest({})).toBe(true)
  })
})
