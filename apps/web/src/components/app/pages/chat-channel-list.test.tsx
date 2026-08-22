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

  it('未読があるチャンネル名を明確な太字で表示する', () => {
    render(
      <ChannelList
        channelId={null}
        onSelectChannel={vi.fn()}
        projectChannels={[]}
        workspaceChannels={[
          workspaceChannel({ name: '既読チャンネル' }),
          workspaceChannel({ id: 'unread-channel', name: '未読チャンネル', unreadCount: 1 }),
        ]}
        dms={[]}
        members={[]}
        onAddChannel={vi.fn()}
        onStartDm={vi.fn()}
      />,
    )

    expect(screen.getByRole('button', { name: /既読チャンネル/ })).toHaveStyle({ fontWeight: 500 })
    expect(screen.getByRole('button', { name: /未読チャンネル/ })).toHaveStyle({ fontWeight: 700 })
  })

  it('プロジェクトメニューから完了済みマイルストーンを個別に表示・非表示にする', () => {
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

    fireEvent.click(screen.getByRole('button', { name: 'プロジェクトAのメニュー' }))
    fireEvent.click(screen.getByRole('menuitem', { name: '完了済みマイルストーンを表示' }))

    expect(screen.getByText('完了A')).toBeInTheDocument()
    expect(screen.queryByText('完了B')).not.toBeInTheDocument()
    expect(screen.getByRole('button', { name: 'プロジェクトAのメニュー' })).toHaveFocus()

    fireEvent.click(screen.getByRole('button', { name: 'プロジェクトBのメニュー' }))
    fireEvent.click(screen.getByRole('menuitem', { name: '完了済みマイルストーンを表示' }))

    expect(screen.getByText('完了A')).toBeInTheDocument()
    expect(screen.getByText('完了B')).toBeInTheDocument()

    fireEvent.click(screen.getByRole('button', { name: 'プロジェクトAのメニュー' }))
    fireEvent.click(screen.getByRole('menuitem', { name: '完了済みマイルストーンを非表示' }))

    expect(screen.queryByText('完了A')).not.toBeInTheDocument()
    expect(screen.getByText('完了B')).toBeInTheDocument()
  })

  it('プロジェクトメニューから対象プロジェクトのマイルストーン作成を開始する', () => {
    const onCreateMilestone = vi.fn()
    render(
      <div className="app app-root">
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
        />
      </div>,
    )

    fireEvent.click(screen.getByRole('button', { name: 'プロジェクトAのメニュー' }))
    const menu = screen.getByRole('menu', { name: 'プロジェクトAの操作' })

    expect(menu.parentElement).toHaveClass('app-root')
    expect(menu.style.background).toBe('var(--card)')
    expect(menu.style.boxShadow).toBe('var(--shadow-pop)')

    fireEvent.click(screen.getByRole('menuitem', { name: 'マイルストーンを作成' }))

    expect(onCreateMilestone).toHaveBeenCalledWith({ id: 'project-1', title: 'プロジェクトA' })
  })

  it('マイルストーンの状態に応じた編集・完了メニューを表示する', () => {
    const onEditMilestone = vi.fn()
    const onSetMilestoneCompleted = vi.fn()
    const activeMilestone = projectChannel({
      channelId: 'active-channel',
      channelName: '進行中',
      milestoneId: 'active-milestone',
      milestoneCompleted: false,
    })
    const completedMilestone = projectChannel({
      channelId: 'completed-channel',
      channelName: '完了済み',
      milestoneId: 'completed-milestone',
      milestoneCompleted: true,
    })

    render(
      <ChannelList
        channelId={null}
        onSelectChannel={vi.fn()}
        projectChannels={[projectChannel({}), activeMilestone, completedMilestone]}
        workspaceChannels={[]}
        dms={[]}
        members={[]}
        onAddChannel={vi.fn()}
        onStartDm={vi.fn()}
        onEditMilestone={onEditMilestone}
        onSetMilestoneCompleted={onSetMilestoneCompleted}
      />,
    )

    fireEvent.click(screen.getByRole('button', { name: '進行中のメニュー' }))
    fireEvent.click(screen.getByRole('menuitem', { name: '編集' }))
    expect(onEditMilestone).toHaveBeenCalledWith(activeMilestone)

    fireEvent.click(screen.getByRole('button', { name: '進行中のメニュー' }))
    fireEvent.click(screen.getByRole('menuitem', { name: '完了にする' }))
    expect(onSetMilestoneCompleted).toHaveBeenCalledWith(activeMilestone, true)

    fireEvent.click(screen.getByRole('button', { name: 'プロジェクトAのメニュー' }))
    fireEvent.click(screen.getByRole('menuitem', { name: '完了済みマイルストーンを表示' }))
    fireEvent.click(screen.getByRole('button', { name: '完了済みのメニュー' }))

    expect(screen.queryByRole('menuitem', { name: '編集' })).not.toBeInTheDocument()
    fireEvent.click(screen.getByRole('menuitem', { name: '未完了にする' }))
    expect(onSetMilestoneCompleted).toHaveBeenCalledWith(completedMilestone, false)
  })

  it('行アクションはPCでホバー表示対象にし、モバイルでは常時表示にする', () => {
    const props = {
      channelId: null,
      onSelectChannel: vi.fn(),
      projectChannels: [projectChannel({})],
      workspaceChannels: [],
      dms: [],
      members: [],
      onAddChannel: vi.fn(),
      onStartDm: vi.fn(),
      onCreateMilestone: vi.fn(),
    }
    const { unmount } = render(<ChannelList {...props} />)

    const desktopAction = screen.getByRole('button', { name: 'プロジェクトAのメニュー' }).closest('.chat-sidebar-item-action')
    expect(desktopAction).toBeInTheDocument()
    expect(desktopAction).not.toHaveAttribute('data-always-visible')

    unmount()
    render(<ChannelList {...props} isMobile />)

    const mobileAction = screen.getByRole('button', { name: 'プロジェクトAのメニュー' }).closest('.chat-sidebar-item-action')
    expect(mobileAction).toHaveAttribute('data-always-visible', 'true')
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
