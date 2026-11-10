import { beforeEach, describe, expect, it, vi } from 'vitest'
import { signOutFromDevice } from './sign-out'
import { finishPendingWebViewSignOut, markWebViewSignOutPending } from './webview-sign-out'

const { storage, signOut, clearDeviceSession, isDeviceOffline } = vi.hoisted(() => {
  const values = new Map<string, string>()
  return {
    storage: {
      values,
      getItem: vi.fn(async (key: string) => values.get(key) ?? null),
      setItem: vi.fn(async (key: string, value: string) => { values.set(key, value) }),
      removeItem: vi.fn(async (key: string) => { values.delete(key) }),
    },
    signOut: vi.fn(),
    clearDeviceSession: vi.fn(),
    isDeviceOffline: vi.fn(),
  }
})

vi.mock('@react-native-async-storage/async-storage', () => ({ default: storage }))
vi.mock('./device-offline', () => ({ isDeviceOffline }))
vi.mock('./supabase', () => ({ clearDeviceSession, supabase: { auth: { signOut } } }))

describe('モバイルの端末ログアウト', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    storage.values.clear()
    signOut.mockResolvedValue({ error: null })
    isDeviceOffline.mockResolvedValue(false)
  })

  it('ネイティブは他端末を含まないローカルスコープで終了する', async () => {
    await signOutFromDevice()
    expect(signOut).toHaveBeenCalledOnce()
    expect(signOut).toHaveBeenCalledWith({ scope: 'local' })
    expect(clearDeviceSession).not.toHaveBeenCalled()
  })

  it('圏外ではネイティブだけを即時に終了し、再接続後に残ったWebViewを先に終了する', async () => {
    isDeviceOffline.mockResolvedValue(true)
    await markWebViewSignOutPending()
    expect(await finishPendingWebViewSignOut(async () => false)).toBe(false)
    await signOutFromDevice()
    expect(signOut).not.toHaveBeenCalled()
    expect(clearDeviceSession).toHaveBeenCalledOnce()

    const finish = vi.fn(async () => true)
    expect(await Promise.all([
      finishPendingWebViewSignOut(finish),
      finishPendingWebViewSignOut(finish),
    ])).toEqual([true, true])
    expect(finish).toHaveBeenCalledOnce()
    expect(await finishPendingWebViewSignOut(finish)).toBe(true)
    expect(finish).toHaveBeenCalledOnce()
  })
})
