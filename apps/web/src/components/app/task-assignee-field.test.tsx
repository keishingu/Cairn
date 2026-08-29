import { render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import { TaskAssigneeField } from './task-assignee-field'

const { channelMembers } = vi.hoisted(() => ({
  channelMembers: [] as Array<{
    userId: string
    channelId: string
    displayName: string
    avatarUrl: string | null
    role: 'owner' | 'admin' | 'member' | 'guest'
  }>,
}))

vi.mock('@/hooks/use-project-members', () => ({
  useWorkspaceMembers: () => ({
    data: [
      {
        userId: 'user-1',
        displayName: '山田太郎',
        avatarUrl: null,
        role: 'member',
      },
      {
        userId: 'guest-1',
        displayName: '未参加ゲスト',
        avatarUrl: null,
        role: 'guest',
      },
    ],
  }),
  useProjectMembers: () => ({ data: [], isFetching: false }),
}))

vi.mock('@/lib/chat/client', () => ({
  useChannelMembers: () => ({ data: channelMembers, isFetching: false }),
}))

describe('TaskAssigneeField', () => {
  beforeEach(() => {
    channelMembers.length = 0
  })

  it('画面下の空きが足りない場合は、ダイアログの外へ上向きに候補を表示する', async () => {
    const user = userEvent.setup()
    const onChange = vi.fn()
    render(
      <div className="app-root">
        <TaskAssigneeField value={null} onChange={onChange} />
      </div>,
    )
    const trigger = screen.getByRole('button', { name: /担当者を選択/ })
    const field = trigger.parentElement

    vi.spyOn(trigger, 'getBoundingClientRect').mockReturnValue({
      x: 100,
      y: 660,
      top: 660,
      right: 420,
      bottom: 700,
      left: 100,
      width: 320,
      height: 40,
      toJSON: () => ({}),
    })

    await user.click(trigger)

    const searchInput = screen.getByPlaceholderText('メンバーを検索...')
    const menu = searchInput.parentElement?.parentElement
    if (!menu) throw new Error('担当者メニューが表示されていません')
    expect(field?.contains(menu)).toBe(false)
    expect(menu.parentElement).toHaveClass('app-root')
    expect(menu).toHaveStyle({ position: 'fixed', bottom: '112px', width: '320px' })

    await user.click(screen.getByRole('button', { name: /山田太郎/ }))
    expect(onChange).toHaveBeenCalledWith('user-1')
  })

  it('公開チャンネルでも未参加guestを候補に表示しない', async () => {
    channelMembers.push({
      userId: 'channel-member-1',
      channelId: 'channel-1',
      displayName: 'チャンネル参加者',
      avatarUrl: null,
      role: 'member',
    })
    const user = userEvent.setup()
    render(
      <div className="app-root">
        <TaskAssigneeField value={null} onChange={vi.fn()} channelId="channel-1" />
      </div>,
    )

    await user.click(screen.getByRole('button', { name: /担当者を選択/ }))

    expect(screen.getByRole('button', { name: /山田太郎/ })).toBeInTheDocument()
    expect(screen.getByRole('button', { name: /チャンネル参加者/ })).toBeInTheDocument()
    expect(screen.queryByRole('button', { name: /未参加ゲスト/ })).not.toBeInTheDocument()
  })
})
