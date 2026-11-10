import '@testing-library/jest-dom'
import { afterEach, beforeEach, vi } from 'vitest'
import { useDraftScope } from '@/hooks/use-draft-scope'
import { enableDraftWrites } from '@/lib/drafts/draft-store'

// 下書き（localStorage）の名前空間は、react-query のプロバイダー無しでも使えるよう既定のユーザー・ワークスペースに固定する。
// 個別のテストは vi.mocked(useDraftScope).mockReturnValue(...) で上書きできる。
vi.mock('@/hooks/use-draft-scope', () => ({ useDraftScope: vi.fn() }))

beforeEach(() => {
  enableDraftWrites()
  vi.mocked(useDraftScope).mockImplementation(() => ({
    scope: { userId: 'user-1', workspaceId: 'ws-1' },
    settled: true,
  }))
})

afterEach(() => {
  try { window.localStorage.clear() } catch { /* node 環境のテストでは localStorage が無い */ }
})
