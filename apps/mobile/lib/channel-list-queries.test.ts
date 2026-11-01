import { describe, expect, it, vi } from 'vitest'
import { invalidateOfflineReadQueries } from './channel-list-queries'

vi.mock('./fetch-api-json', () => ({ fetchApiJson: vi.fn() }))
vi.mock('./offline-cache-store', () => ({ fetchWithOfflineCache: vi.fn() }))

describe('回線復帰・前面復帰の再取得', () => {
  it('一覧・メッセージ・通知・アカウントを取り直す', async () => {
    const invalidateQueries = vi.fn().mockResolvedValue(undefined)

    await invalidateOfflineReadQueries({ invalidateQueries })

    const keys = invalidateQueries.mock.calls.map(([filter]) => filter.queryKey[0])
    expect(keys).toEqual(
      expect.arrayContaining([
        'project-channels',
        'workspace-channels',
        'workspace-dms',
        'messages',
        'notifications',
        'me',
        'workspace',
      ]),
    )
  })
})
