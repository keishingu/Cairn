import { beforeEach, describe, expect, it, vi } from 'vitest'

const { mockFetch, mockInvalidate, mockMutation } = vi.hoisted(() => ({
  mockFetch: vi.fn(), mockInvalidate: vi.fn(), mockMutation: vi.fn(),
}))
vi.mock('@tanstack/react-query', () => ({
  useMutation: mockMutation,
  useQuery: vi.fn(),
  useQueryClient: () => ({ invalidateQueries: mockInvalidate }),
}))
vi.mock('../lib/api-fetch', () => ({ apiFetch: mockFetch }))
vi.mock('../components/locale-provider', () => ({ useT: () => (value: string) => value }))

import { usePatchProjectMilestone } from './use-chat-channels'

describe('ネイティブのマイルストーン完了切替', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    mockMutation.mockImplementation(options => options)
    mockInvalidate.mockResolvedValue(undefined)
  })

  it('409のとき一覧を再取得する', async () => {
    mockFetch.mockResolvedValue(new Response(JSON.stringify({ error: 'milestone_conflict' }), { status: 409 }))
    const mutation = usePatchProjectMilestone() as unknown as {
      mutationFn: (input: { projectId: string; milestoneId: string; completed: boolean; expectedUpdatedAt: string }) => Promise<void>
      onError: (error: Error) => void
    }
    const input = { projectId: 'p1', milestoneId: 'm1', completed: true, expectedUpdatedAt: '2026-08-01T00:00:00.000Z' }
    await expect(mutation.mutationFn(input)).rejects.toThrow('milestone_conflict')
    mutation.onError(new Error('milestone_conflict'))
    expect(mockInvalidate).toHaveBeenCalledWith({ queryKey: ['project-channels'] })
  })
})
