import React from 'react'
import { fireEvent, render, screen, waitFor } from '@testing-library/react'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import { EditMilestoneModal } from './create-milestone-modal'
import { fetchWithAuth } from '@/lib/fetch-with-auth'
import type { MilestoneDto } from '@/app/api/projects/[id]/milestones/route'

vi.mock('@/lib/fetch-with-auth')
const mockFetch = vi.mocked(fetchWithAuth)

const milestone: MilestoneDto = {
  id: 'milestone-1',
  projectId: 'project-1',
  title: '初回リリース',
  description: '公開準備',
  startDate: '2026-08-01',
  endDate: '2026-08-08',
  startTime: '09:00',
  endTime: '18:00',
  completed: false,
  channelId: 'channel-1',
}

describe('EditMilestoneModal', () => {
  beforeEach(() => mockFetch.mockReset())

  it('既存値を表示し、空欄にした項目を含めて更新する', async () => {
    const onClose = vi.fn()
    mockFetch.mockImplementation(async (_url, init) => {
      if (init?.method === 'PATCH') {
        return new Response(JSON.stringify({ ...milestone, title: '正式リリース', description: null }), { status: 200 })
      }
      return new Response(JSON.stringify([milestone]), { status: 200 })
    })
    const queryClient = new QueryClient({
      defaultOptions: { queries: { retry: false }, mutations: { retry: false } },
    })

    render(
      <QueryClientProvider client={queryClient}>
        <EditMilestoneModal
          projectId="project-1"
          projectTitle="プロジェクトA"
          milestoneId="milestone-1"
          onClose={onClose}
        />
      </QueryClientProvider>,
    )

    expect(await screen.findByLabelText(/マイルストーン名/)).toHaveValue('初回リリース')
    expect(screen.getByRole('heading', { name: 'マイルストーンを編集' })).toBeInTheDocument()
    expect(screen.getByLabelText(/説明/)).toHaveValue('公開準備')

    fireEvent.change(screen.getByLabelText(/マイルストーン名/), { target: { value: '正式リリース' } })
    fireEvent.change(screen.getByLabelText(/説明/), { target: { value: '' } })
    fireEvent.click(screen.getByRole('button', { name: '保存する' }))

    await waitFor(() => expect(onClose).toHaveBeenCalledOnce())
    expect(mockFetch).toHaveBeenCalledWith(
      '/api/projects/project-1/milestones/milestone-1',
      expect.objectContaining({
        method: 'PATCH',
        body: JSON.stringify({
          title: '正式リリース',
          description: null,
          startDate: '2026-08-01',
          endDate: '2026-08-08',
          startTime: '09:00',
          endTime: '18:00',
        }),
      }),
    )
  })
})
