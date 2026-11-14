import { fireEvent, render, screen } from '@testing-library/react'
import React from 'react'
import { describe, expect, it, vi } from 'vitest'
import type { ProjectDto } from '@/app/api/projects/route'
import { ProjectPanel } from './project-panel'

const { mockSave } = vi.hoisted(() => ({ mockSave: vi.fn() }))

vi.mock('@/components/locale-provider', () => ({ useT: () => (message: string) => message }))
vi.mock('next/navigation', () => ({ useRouter: () => ({ push: vi.fn() }) }))
vi.mock('@/lib/use-pinned-projects', () => ({
  usePinnedProjects: () => ({ data: [] }),
  usePinProject: () => ({ mutate: vi.fn() }),
  useUnpinProject: () => ({ mutate: vi.fn() }),
}))
vi.mock('@/lib/chat/client', () => ({ useProjectChannels: () => ({ data: [] }) }))
vi.mock('@/hooks/use-project-cover-photo', () => ({
  useApplyPlacePhoto: () => ({ mutate: vi.fn() }),
  useClearProjectCoverPhoto: () => ({ mutate: vi.fn() }),
  usePlacePhotos: () => ({ data: [] }),
}))
vi.mock('./tabs/chat-tab', () => ({ ChatTab: () => null }))
vi.mock('./tabs/files-tab', () => ({ FilesTab: () => null }))
vi.mock('./tabs/tasks-tab', () => ({ TasksTab: () => null }))
vi.mock('./tabs/members-tab', () => ({ MembersTab: () => null }))
vi.mock('./tabs/gallery-tab', () => ({ GalleryTab: () => null }))
// 概要タブは、実物と同じ InlineText でプロジェクトのタイトルを編集し、保存先のプロジェクト ID を記録する
vi.mock('./tabs/overview-tab', async importOriginal => {
  const actual = await importOriginal<typeof import('./tabs/overview-tab')>()
  return {
    ...actual,
    OverviewTab: ({ project }: { project: ProjectDto }) => (
      <actual.InlineText value={project.title} onSave={v => Promise.resolve(mockSave(project.id, v))} />
    ),
  }
})

const project = (id: string, title: string) => ({ id, title } as unknown as ProjectDto)

describe('プロジェクトパネルの編集状態', () => {
  it('別のプロジェクトへ切り替えると、概要タブの下書きは持ち越されず、旧プロジェクトの内容を新しい方へ保存できない', () => {
    const { rerender } = render(<ProjectPanel project={project('a', '案件A')} onClose={vi.fn()} tab="overview" />)

    fireEvent.click(screen.getByRole('button', { name: '案件A' }))
    fireEvent.change(screen.getByRole('textbox'), { target: { value: 'Aの下書き' } })

    rerender(<ProjectPanel project={project('b', '案件B')} onClose={vi.fn()} tab="overview" />)

    expect(screen.queryByRole('textbox')).toBeNull()
    expect(screen.getByRole('button', { name: '案件B' })).toBeInTheDocument()
    expect(mockSave).not.toHaveBeenCalled()
  })
})
