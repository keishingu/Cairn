import { describe, expect, it, vi } from 'vitest'
import { patchMilestoneCompletion } from './milestone-completion'

describe('マイルストーンの完了切替', () => {
  it('メニュー表示時の世代を送る', async () => {
    const fetcher = vi.fn().mockResolvedValue(new Response('{}'))
    await patchMilestoneCompletion({ projectId: 'p1', milestoneId: 'm1', completed: true, expectedUpdatedAt: '2026-08-01T00:00:00.000Z' }, fetcher, '失敗')
    expect(fetcher).toHaveBeenCalledWith('/api/projects/p1/milestones/m1', {
      method: 'PATCH', body: JSON.stringify({ completed: true, expectedUpdatedAt: '2026-08-01T00:00:00.000Z' }),
    })
  })

  it('世代がない古いキャッシュでは更新を送らない', async () => {
    const fetcher = vi.fn()
    await expect(patchMilestoneCompletion({ projectId: 'p1', milestoneId: 'm1', completed: true, expectedUpdatedAt: '' }, fetcher, '失敗')).rejects.toThrow('milestone_conflict')
    expect(fetcher).not.toHaveBeenCalled()
  })

  it('古い世代の409を呼び出し元へ伝える', async () => {
    const fetcher = vi.fn().mockResolvedValue(new Response(JSON.stringify({ error: 'milestone_conflict' }), { status: 409 }))
    await expect(patchMilestoneCompletion({ projectId: 'p1', milestoneId: 'm1', completed: true, expectedUpdatedAt: '2026-08-01T00:00:00.000Z' }, fetcher, '失敗')).rejects.toThrow('milestone_conflict')
  })
})
