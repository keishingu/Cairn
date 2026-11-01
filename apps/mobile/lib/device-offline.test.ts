import { beforeEach, describe, expect, it, vi } from 'vitest'

const { mockGetNetworkState } = vi.hoisted(() => ({ mockGetNetworkState: vi.fn() }))

vi.mock('expo-network', () => ({ getNetworkStateAsync: mockGetNetworkState }))

describe('isDeviceOffline', () => {
  beforeEach(() => vi.clearAllMocks())

  it('明示的に圏外なら true を返す', async () => {
    mockGetNetworkState.mockResolvedValue({ isConnected: false, isInternetReachable: false })
    const { isDeviceOffline } = await import('./device-offline')

    await expect(isDeviceOffline()).resolves.toBe(true)
  })

  it('状態を取得できないときは圏外と決めつけない', async () => {
    mockGetNetworkState.mockRejectedValue(new Error('native error'))
    const { isDeviceOffline } = await import('./device-offline')

    await expect(isDeviceOffline()).resolves.toBe(false)
  })
})
