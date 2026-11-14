import { fireEvent, render, screen, waitFor } from '@testing-library/react'
import React from 'react'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import { InlineText, MilestoneSection } from './overview-tab'

const { mockPatchAsync, mockToastError } = vi.hoisted(() => ({ mockPatchAsync: vi.fn(), mockToastError: vi.fn() }))

vi.mock('@/components/locale-provider', () => ({ useT: () => (message: string) => message }))
vi.mock('next/navigation', () => ({ useRouter: () => ({ push: vi.fn() }) }))
vi.mock('@/lib/toast', () => ({ toast: { error: mockToastError, success: vi.fn() } }))
vi.mock('@/hooks/use-project-milestones', () => ({
  useProjectMilestones: () => ({
    isLoading: false,
    isError: false,
    data: [{
      id: 'm1', channelId: 'c1', title: '下見', description: null, startDate: null, endDate: null,
      startTime: null, endTime: null, completed: false,
    }],
    patchMutation: { mutateAsync: mockPatchAsync },
    createMutation: { mutate: vi.fn(), isPending: false },
    deleteMutation: { mutateAsync: vi.fn() },
  }),
}))

describe('マイルストーンのインライン編集の失敗表示', () => {
  it('編集中に別の更新が来ても編集開始時の世代で保存する', async () => {
    const onSave = vi.fn().mockResolvedValue(undefined)
    const { rerender } = render(<InlineText value="元の値" version="version-a" onSave={onSave} />)
    fireEvent.click(screen.getByText('元の値'))
    fireEvent.change(screen.getByRole('textbox'), { target: { value: '入力中' } })
    rerender(<InlineText value="他の人の値" version="version-b" onSave={onSave} />)
    fireEvent.click(screen.getByRole('button', { name: 'Save' }))
    await waitFor(() => expect(onSave).toHaveBeenCalledWith('入力中', 'version-a'))
  })

  beforeEach(() => {
    mockPatchAsync.mockReset()
    mockToastError.mockReset()
  })

  it('タイトルの保存に失敗したら、編集欄のエラーを1回だけ表示し、トーストは出さない', async () => {
    mockPatchAsync.mockRejectedValue(new Error('通信に失敗しました'))
    render(<MilestoneSection projectId="p1" projectTitle="P" canEdit />)

    fireEvent.click(screen.getByText('下見'))
    fireEvent.change(screen.getByRole('textbox'), { target: { value: '本番' } })
    fireEvent.click(screen.getByRole('button', { name: 'Save' }))

    await waitFor(() => expect(screen.getAllByText('Could not update this milestone')).toHaveLength(1))
    expect(screen.getByRole('textbox')).toHaveValue('本番')
    expect(mockToastError).not.toHaveBeenCalled()
  })

  it('完了チェックの保存に失敗したときはトーストで知らせる', async () => {
    mockPatchAsync.mockRejectedValue(new Error('通信に失敗しました'))
    render(<MilestoneSection projectId="p1" projectTitle="P" canEdit />)

    fireEvent.click(screen.getByRole('checkbox', { name: 'Complete' }))

    await waitFor(() => expect(mockToastError).toHaveBeenCalledWith('Could not update this milestone'))
  })
})
