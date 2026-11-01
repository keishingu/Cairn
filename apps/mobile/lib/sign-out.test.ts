import { beforeEach, describe, expect, it, vi } from 'vitest'

const { mockSignOut, mockClearDeviceSession, mockIsDeviceOffline } = vi.hoisted(() => ({
  mockSignOut: vi.fn(),
  mockClearDeviceSession: vi.fn(),
  mockIsDeviceOffline: vi.fn(),
}))

vi.mock('./supabase', () => ({
  supabase: { auth: { signOut: mockSignOut } },
  clearDeviceSession: mockClearDeviceSession,
}))

vi.mock('./device-offline', () => ({ isDeviceOffline: mockIsDeviceOffline }))

describe('signOutFromDevice', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    vi.spyOn(console, 'warn').mockImplementation(() => undefined)
    vi.spyOn(console, 'error').mockImplementation(() => undefined)
    mockIsDeviceOffline.mockResolvedValue(false)
    mockSignOut.mockResolvedValue({ error: null })
    mockClearDeviceSession.mockResolvedValue(undefined)
  })

  it('サーバーで失効できれば端末側の消去はしない', async () => {
    const { signOutFromDevice } = await import('./sign-out')

    await signOutFromDevice()

    expect(mockSignOut).toHaveBeenCalledTimes(1)
    expect(mockClearDeviceSession).not.toHaveBeenCalled()
  })

  it('signOut が通信失敗を error で返したら端末のセッションを消す', async () => {
    mockSignOut.mockResolvedValue({ error: new Error('Network request failed') })
    const { signOutFromDevice } = await import('./sign-out')

    await signOutFromDevice()

    expect(mockClearDeviceSession).toHaveBeenCalledTimes(1)
  })

  it('明示的に圏外なら signOut を待たず端末のセッションを消す', async () => {
    mockIsDeviceOffline.mockResolvedValue(true)
    const { signOutFromDevice } = await import('./sign-out')

    await signOutFromDevice()

    expect(mockSignOut).not.toHaveBeenCalled()
    expect(mockClearDeviceSession).toHaveBeenCalledTimes(1)
  })

  it('端末のセッションを消せなくても呼び出し元へ例外を投げない', async () => {
    mockIsDeviceOffline.mockResolvedValue(true)
    mockClearDeviceSession.mockRejectedValue(new Error('storage failed'))
    const { signOutFromDevice } = await import('./sign-out')

    await expect(signOutFromDevice()).resolves.toBeUndefined()
    expect(console.error).toHaveBeenCalled()
  })
})
