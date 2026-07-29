import { beforeEach, describe, expect, it, vi } from 'vitest'

const { getItem, setItem } = vi.hoisted(() => ({
  getItem: vi.fn(),
  setItem: vi.fn(),
}))

vi.mock('@react-native-async-storage/async-storage', () => ({
  default: { getItem, setItem },
}))

describe('モバイルのワークスペース選択', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    vi.resetModules()
  })

  it('ユーザーごとの保存先から選択中IDを読む', async () => {
    getItem.mockResolvedValue('workspace-1')
    const { getSelectedWorkspaceId } = await import('./workspace-selection')

    await expect(getSelectedWorkspaceId('user-1')).resolves.toBe('workspace-1')
    expect(getItem).toHaveBeenCalledWith('cairn.workspace-selection:user-1')
  })

  it('切替後は同じユーザーの後続リクエストへ即時反映する', async () => {
    getItem.mockResolvedValue(null)
    setItem.mockResolvedValue(undefined)
    const { getSelectedWorkspaceId, setSelectedWorkspaceId } = await import('./workspace-selection')

    await setSelectedWorkspaceId('user-1', 'workspace-2')

    await expect(getSelectedWorkspaceId('user-1')).resolves.toBe('workspace-2')
    expect(setItem).toHaveBeenCalledWith('cairn.workspace-selection:user-1', 'workspace-2')
    expect(getItem).not.toHaveBeenCalled()
  })

  it('一時的な読み込み失敗後は次のリクエストで再試行する', async () => {
    getItem
      .mockRejectedValueOnce(new Error('storage unavailable'))
      .mockResolvedValueOnce('workspace-3')
    const { getSelectedWorkspaceId } = await import('./workspace-selection')

    await expect(getSelectedWorkspaceId('user-1')).rejects.toThrow('storage unavailable')
    await expect(getSelectedWorkspaceId('user-1')).resolves.toBe('workspace-3')
    expect(getItem).toHaveBeenCalledTimes(2)
  })
})
