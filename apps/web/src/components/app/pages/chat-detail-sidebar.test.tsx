// Copyright 2026 Cairn Contributors
// SPDX-License-Identifier: Apache-2.0

import { render, screen, waitFor } from '@testing-library/react'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import userEvent from '@testing-library/user-event'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import { ChatDetailSidebar } from './chat-detail-sidebar'
import { useChannelFiles } from '@/hooks/use-channel-files'
import { useProjectTasks } from '@/hooks/use-project-tasks'
import type { ProjectDto } from '@/app/api/projects/route'

const { renameMutateAsyncMock, fetchWithAuthMock } = vi.hoisted(() => ({
  renameMutateAsyncMock: vi.fn(),
  fetchWithAuthMock: vi.fn(),
}))

vi.mock('@/hooks/use-channel-files')
vi.mock('@/hooks/use-rename-file', () => ({
  useRenameFile: vi.fn(() => ({ mutateAsync: renameMutateAsyncMock })),
}))
vi.mock('@/lib/fetch-with-auth', () => ({
  fetchWithAuth: fetchWithAuthMock,
}))
vi.mock('../task-edit-dialog', () => ({
  TaskEditDialog: ({ open }: { open: boolean }) => open ? <div data-testid="task-edit-dialog" /> : null,
}))
vi.mock('@/hooks/use-project-tasks', () => ({
  useProjectTasks: vi.fn(() => ({
    data: [],
    isLoading: false,
    toggleMutation: { mutate: vi.fn() },
  })),
}))

const mockUseChannelFiles = vi.mocked(useChannelFiles)
const mockUseProjectTasks = vi.mocked(useProjectTasks)

const project: ProjectDto = {
  id: 'project-1', title: 'プロジェクト', description: null, statusName: null, statusColor: null,
  startDate: null, endDate: null, memberCount: 0, memberNames: [], memberAvatarUrls: [],
  taskCount: 2, completedTaskCount: 0, isOwner: true, isMember: true, archived: false,
  coverPhotoIdx: 0, coverPhotoUrl: null, location: null, placeId: null,
}

function renderSidebar(onJumpToMessage = vi.fn()) {
  const queryClient = new QueryClient({ defaultOptions: { queries: { retry: false } } })
  render(
    <QueryClientProvider client={queryClient}><ChatDetailSidebar
      isProject={false}
      isDm={false}
      isPrivate={false}
      channelName="全体"
      currentDmAvatarUrl={null}
      dmParticipantId={null}
      project={null}
      channelMembers={[]}
      memberLabel={null}
      channelId="channel-1"
      showMemberInvite={false}
      onInviteMember={vi.fn()}
      onCloseMemberInvite={vi.fn()}
      onOpenProject={vi.fn()}
      onOpenMember={vi.fn()}
      onJumpToMessage={onJumpToMessage}
    /></QueryClientProvider>,
  )
  return onJumpToMessage
}

function renderProjectSidebar(onJumpToMessage = vi.fn()) {
  const queryClient = new QueryClient({ defaultOptions: { queries: { retry: false } } })
  render(
    <QueryClientProvider client={queryClient}><ChatDetailSidebar
      isProject
      isDm={false}
      isPrivate={false}
      channelName="プロジェクト"
      currentDmAvatarUrl={null}
      dmParticipantId={null}
      project={project}
      channelMembers={[]}
      memberLabel={null}
      channelId="channel-1"
      showMemberInvite={false}
      onInviteMember={vi.fn()}
      onCloseMemberInvite={vi.fn()}
      onOpenProject={vi.fn()}
      onOpenMember={vi.fn()}
      onJumpToMessage={onJumpToMessage}
    /></QueryClientProvider>,
  )
  return onJumpToMessage
}

describe('チャット詳細サイドバーのファイル一覧', () => {
  beforeEach(() => {
    renameMutateAsyncMock.mockReset()
    renameMutateAsyncMock.mockResolvedValue({ success: true, fileName: 'renamed.pdf' })
    fetchWithAuthMock.mockReset()
    fetchWithAuthMock.mockResolvedValue(new Response('# 見出し\n\nMarkdownです'))
    vi.spyOn(window, 'open').mockImplementation(() => null)
    mockUseProjectTasks.mockReturnValue({
      data: [],
      isLoading: false,
      toggleMutation: { mutate: vi.fn() },
    } as unknown as ReturnType<typeof useProjectTasks>)
    mockUseChannelFiles.mockReturnValue({
      data: [
        {
          id: 'file-1',
          sourceMessageId: 'message-1',
          fileName: 'guide.pdf',
          mimeType: 'application/pdf',
          fileSize: 1024,
          fileType: 'document',
          uploaderName: '山田 太郎',
          createdAt: '2026-08-07T03:45:00.000Z',
        },
      ],
      isLoading: false,
      isError: false,
    } as ReturnType<typeof useChannelFiles>)
  })

  it('ファイルを開かず、共有されたメッセージへジャンプする', async () => {
    const onJumpToMessage = renderSidebar()

    expect(screen.queryByRole('link', { name: /guide\.pdf/ })).not.toBeInTheDocument()
    await userEvent.click(screen.getByRole('button', { name: /guide\.pdf/ }))

    expect(onJumpToMessage).toHaveBeenCalledWith('message-1')
  })

  it('操作メニューからファイルを開く', async () => {
    renderSidebar()

    await userEvent.click(screen.getByTitle('操作'))
    await userEvent.click(screen.getByRole('button', { name: 'ファイルを開く' }))

    expect(window.open).toHaveBeenCalledWith(
      '/api/attachments/file-1',
      '_blank',
      'noopener,noreferrer',
    )
  })

  it('外部リンクは中継せず直接開く', async () => {
    const externalUrl = 'https://docs.google.com/document/d/doc-1/edit'
    mockUseChannelFiles.mockReturnValue({
      data: [{
        id: 'link-1', sourceMessageId: 'message-1', fileName: 'Google ドキュメント',
        mimeType: null, fileSize: null, fileType: 'link', uploaderName: '山田 太郎',
        createdAt: '2026-08-07T03:45:00.000Z', externalUrl,
      }],
      isLoading: false,
      isError: false,
    } as ReturnType<typeof useChannelFiles>)
    renderSidebar()

    await userEvent.click(screen.getByTitle('操作'))
    await userEvent.click(screen.getByRole('button', { name: 'ファイルを開く' }))

    expect(window.open).toHaveBeenCalledWith(externalUrl, '_blank', 'noopener,noreferrer')
  })

  it('操作メニューからファイル名をインライン変更する', async () => {
    renderSidebar()

    await userEvent.click(screen.getByTitle('操作'))
    await userEvent.click(screen.getByRole('button', { name: '名前を変更' }))
    const input = screen.getByRole('textbox', { name: 'ファイル名を変更' })
    await userEvent.clear(input)
    await userEvent.type(input, 'renamed.pdf{enter}')

    await waitFor(() => expect(renameMutateAsyncMock).toHaveBeenCalledWith({
      fileId: 'file-1',
      fileName: 'renamed.pdf',
    }))
  })

  it('ファイルアイコンで Markdown プレビューを開き、ファイル名で共有元へ移動する', async () => {
    mockUseChannelFiles.mockReturnValue({
      data: [{
        id: 'markdown-1', sourceMessageId: 'message-1', fileName: 'guide.md',
        mimeType: 'text/markdown', fileSize: 120, fileType: 'document',
        uploaderName: '山田 太郎', createdAt: '2026-08-07T03:45:00.000Z',
      }],
      isLoading: false, isError: false,
    } as ReturnType<typeof useChannelFiles>)
    const onJumpToMessage = renderSidebar()

    await userEvent.click(screen.getByTitle('ファイルを開く'))
    expect(await screen.findByRole('dialog', { name: 'guide.md のプレビュー' })).toBeInTheDocument()
    expect(await screen.findByRole('heading', { name: '見出し' })).toBeInTheDocument()

    await userEvent.click(screen.getByLabelText('プレビューを閉じる'))
    await userEvent.click(screen.getByRole('button', { name: /guide\.md/ }))
    expect(onJumpToMessage).toHaveBeenCalledWith('message-1')
  })
})

describe('チャット詳細サイドバーのタスク一覧', () => {
  beforeEach(() => {
    mockUseProjectTasks.mockReturnValue({
      data: [
        {
          id: 'linked-task', projectId: 'project-1', projectTitle: 'プロジェクト', title: 'メッセージ由来のタスク',
          status: 'todo', priority: 'medium', dueDate: null, assigneeId: null, assigneeName: null, assigneeAvatarUrl: null,
          sourceMessageId: 'message-1', isLinkedToMessage: true,
        },
        {
          id: 'standalone-task', projectId: 'project-1', projectTitle: 'プロジェクト', title: '通常のタスク',
          status: 'todo', priority: 'medium', dueDate: null, assigneeId: null, assigneeName: null, assigneeAvatarUrl: null,
          sourceMessageId: null, isLinkedToMessage: false,
        },
      ],
      isLoading: false,
      toggleMutation: { mutate: vi.fn() },
    } as unknown as ReturnType<typeof useProjectTasks>)
  })

  it('メッセージに紐付くタスクだけに吹き出しアイコンを表示する', () => {
    renderProjectSidebar()

    expect(screen.getAllByLabelText('メッセージに紐付いています')).toHaveLength(1)
  })
})
