import React from 'react'
import { fireEvent, render, screen, waitFor } from '@testing-library/react'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import { CreateMilestoneModal, EditMilestoneModal } from './create-milestone-modal'
import { AppShellContext } from '../app-shell-context'
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

  it('キャッシュより新しい取得結果を編集フォームの初期値にする', async () => {
    const freshMilestone = { ...milestone, title: '最新リリース' }
    mockFetch.mockResolvedValue(new Response(JSON.stringify([freshMilestone]), { status: 200 }))
    const queryClient = new QueryClient({
      defaultOptions: { queries: { retry: false, staleTime: 60_000 }, mutations: { retry: false } },
    })
    queryClient.setQueryData(['project-milestones', 'project-1'], [{ ...milestone, title: '古いリリース' }])

    render(
      <QueryClientProvider client={queryClient}>
        <EditMilestoneModal
          projectId="project-1"
          projectTitle="プロジェクトA"
          milestoneId="milestone-1"
          onClose={vi.fn()}
        />
      </QueryClientProvider>,
    )

    expect(screen.getByText('読み込み中…')).toBeInTheDocument()
    expect(screen.queryByLabelText(/マイルストーン名/)).not.toBeInTheDocument()
    expect(await screen.findByLabelText(/マイルストーン名/)).toHaveValue('最新リリース')
  })

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

function renderCreate(options: { isMobile: boolean; onCreated?: () => void }) {
  const queryClient = new QueryClient({ defaultOptions: { queries: { retry: false }, mutations: { retry: false } } })
  const ui = (
    <QueryClientProvider client={queryClient}>
      <CreateMilestoneModal
        projectId="project-1"
        projectTitle="プロジェクトA"
        defaultMonth="2026-06-13"
        onClose={vi.fn()}
        onCreated={options.onCreated ?? vi.fn()}
      />
    </QueryClientProvider>
  )
  return render(options.isMobile ? (
    <AppShellContext.Provider value={{
      openPanel: () => {}, openMember: () => {}, openNotif: () => {}, isWebView: false, isMobile: true,
      projectsView: 'list', setProjectsView: () => {}, crossSearchNonce: 0, consumeCrossSearch: () => {},
    }}>{ui}</AppShellContext.Provider>
  ) : ui)
}

describe('CreateMilestoneModal', () => {
  beforeEach(() => mockFetch.mockReset())

  it('PC では終了日が開始日より前なら作成を止め、入力を残したままエラーを出す', () => {
    renderCreate({ isMobile: false })

    fireEvent.change(screen.getByLabelText(/マイルストーン名/), { target: { value: '下見' } })
    fireEvent.change(screen.getByLabelText('開始日'), { target: { value: '2026-06-12' } })
    fireEvent.change(screen.getByLabelText('終了日'), { target: { value: '2026-06-10' } })
    fireEvent.click(screen.getByRole('button', { name: '作成する' }))

    expect(screen.getByText('終了日は開始日以降にしてください')).toBeInTheDocument()
    expect(mockFetch).not.toHaveBeenCalled()
    expect(screen.getByLabelText(/マイルストーン名/)).toHaveValue('下見')
  })

  it('モバイルではボトムシートのカレンダーで日程を選び、プロジェクトの月から開く', async () => {
    const onCreated = vi.fn()
    mockFetch.mockResolvedValue(new Response(JSON.stringify({ ...milestone, title: '下見' }), { status: 201 }))
    renderCreate({ isMobile: true, onCreated })

    expect(screen.getByRole('grid', { name: '2026年6月' })).toBeInTheDocument()
    fireEvent.change(screen.getByLabelText(/マイルストーン名/), { target: { value: '下見' } })
    const day = (n: number) => screen.getAllByRole('gridcell').find(c => c.textContent === String(n))!
    fireEvent.click(day(14))
    fireEvent.click(day(15))
    fireEvent.click(screen.getByRole('button', { name: '作成する' }))

    await waitFor(() => expect(onCreated).toHaveBeenCalledOnce())
    expect(mockFetch).toHaveBeenCalledWith(
      '/api/projects/project-1/milestones',
      expect.objectContaining({
        method: 'POST',
        body: JSON.stringify({ title: '下見', startDate: '2026-06-14', endDate: '2026-06-15' }),
      }),
    )
  })
})
