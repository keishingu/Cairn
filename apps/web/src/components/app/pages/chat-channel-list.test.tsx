import { beforeEach, describe, expect, it, vi } from 'vitest'
import { fireEvent, render, screen } from '@testing-library/react'
import { ChannelList, formatChannelPeriod } from './chat-channel-list'
import type { ProjectChannelDto } from '@/app/api/projects/channels/route'
import type { WorkspaceChannelDto } from '@/app/api/workspaces/channels/route'

const projectChannel = (overrides: Partial<ProjectChannelDto>): ProjectChannelDto => ({
  channelId: 'project-channel-1',
  channelName: 'general',
  projectId: 'project-1',
  projectTitle: 'プロジェクトA',
  startDate: null,
  endDate: null,
  startTime: null,
  endTime: null,
  archived: false,
  unreadCount: 0,
  unreadMentionCount: 0,
  milestoneId: null,
  milestoneCompleted: null,
  ...overrides,
})

const workspaceChannel = (overrides: Partial<WorkspaceChannelDto>): WorkspaceChannelDto => ({
  id: 'workspace-channel-1',
  name: '雑談',
  parentChannelId: null,
  isPrivate: false,
  memberCount: 0,
  memberNames: [],
  memberAvatarUrls: [],
  unreadCount: 0,
  unreadMentionCount: 0,
  ...overrides,
})

describe('formatChannelPeriod', () => {
  it('開始日と終了日が同じなら開いた期間に見せない', () => {
    expect(formatChannelPeriod('2026-07-14', '2026-07-14')).toBe('7/14')
  })

  it('単日でも終了時刻があれば時刻範囲を表示する', () => {
    expect(formatChannelPeriod('2026-07-14', '2026-07-14', '10:00', '12:00')).toBe('7/14 10:00〜12:00')
  })
})

describe('ChannelList', () => {
  beforeEach(() => localStorage.clear())

  it('完了済みマイルストーンをプロジェクトごとに折りたたむ', () => {
    render(
      <ChannelList
        channelId={null}
        onSelectChannel={vi.fn()}
        projectChannels={[
          projectChannel({}),
          projectChannel({ channelId: 'completed-a', channelName: '完了A', milestoneId: 'milestone-a', milestoneCompleted: true }),
          projectChannel({ channelId: 'project-channel-2', projectId: 'project-2', projectTitle: 'プロジェクトB' }),
          projectChannel({ channelId: 'completed-b', channelName: '完了B', projectId: 'project-2', projectTitle: 'プロジェクトB', milestoneId: 'milestone-b', milestoneCompleted: true }),
        ]}
        workspaceChannels={[]}
        dms={[]}
        members={[]}
        onAddChannel={vi.fn()}
        onStartDm={vi.fn()}
      />,
    )

    expect(screen.queryByText('完了A')).not.toBeInTheDocument()
    expect(screen.queryByText('完了B')).not.toBeInTheDocument()

    const completedToggles = screen.getAllByRole('button', { name: /完了済みマイルストーン/ })
    fireEvent.click(completedToggles[0]!)

    expect(screen.getByText('完了A')).toBeInTheDocument()
    expect(screen.queryByText('完了B')).not.toBeInTheDocument()
  })

  it('プロジェクトメニューから対象プロジェクトのマイルストーン作成を開始する', () => {
    const onCreateMilestone = vi.fn()
    render(
      <ChannelList
        channelId={null}
        onSelectChannel={vi.fn()}
        projectChannels={[projectChannel({})]}
        workspaceChannels={[]}
        dms={[]}
        members={[]}
        onAddChannel={vi.fn()}
        onStartDm={vi.fn()}
        onCreateMilestone={onCreateMilestone}
      />,
    )

    fireEvent.click(screen.getByRole('button', { name: 'プロジェクトAのメニュー' }))
    fireEvent.click(screen.getByRole('menuitem', { name: 'マイルストーンを作成' }))

    expect(onCreateMilestone).toHaveBeenCalledWith({ id: 'project-1', title: 'プロジェクトA' })
  })

  it('チャンネルの直下にスレッドを表示し、メニューから作成を開始する', () => {
    const onCreateThread = vi.fn()
    render(
      <ChannelList
        channelId={null}
        onSelectChannel={vi.fn()}
        projectChannels={[]}
        workspaceChannels={[
          workspaceChannel({}),
          workspaceChannel({ id: 'thread-1', name: 'リリース準備', parentChannelId: 'workspace-channel-1' }),
        ]}
        dms={[]}
        members={[]}
        onAddChannel={vi.fn()}
        onStartDm={vi.fn()}
        onCreateThread={onCreateThread}
      />,
    )

    expect(screen.getByText('リリース準備')).toBeInTheDocument()
    fireEvent.click(screen.getByRole('button', { name: '雑談のメニュー' }))
    fireEvent.click(screen.getByRole('menuitem', { name: 'スレッドを作成' }))

    expect(onCreateThread).toHaveBeenCalledWith({ id: 'workspace-channel-1', name: '雑談' })
  })
})
