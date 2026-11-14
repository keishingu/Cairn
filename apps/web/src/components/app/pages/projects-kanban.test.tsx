import { render, screen, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import { PageKanban } from './projects-kanban'

const permissions = vi.hoisted(() => ({ isAdmin: true }))
vi.mock('@/hooks/use-current-user', () => ({ useWorkspacePermissions: () => permissions }))
vi.mock('@/lib/use-workspace-settings', () => ({ useProjectLabel: () => 'プロジェクト' }))
vi.mock('@/lib/command-registry', () => ({ useCommand: vi.fn() }))
const board = vi.hoisted(() => ({ projectFilter: undefined as undefined | ((p: { isJoined: boolean; memberNames: string[] }) => boolean) }))
vi.mock('../kanban', () => ({
  KanbanBoard: (props: { projectFilter?: (p: { isJoined: boolean; memberNames: string[] }) => boolean }) => { board.projectFilter = props.projectFilter; return <div>カンバン</div> },
}))
vi.mock('@/components/app/mobile/header', () => ({ MobileHeader: () => null }))
vi.mock('../mobile/create-project-sheet', () => ({
  CreateProjectSheet: ({ onClose }: { onClose: () => void }) => <div role="dialog" aria-label="プロジェクト作成"><button onClick={onClose}>キャンセル</button></div>,
}))

function renderKanban(isMobile: boolean) {
  const client = new QueryClient({ defaultOptions: { queries: { staleTime: Infinity } } })
  client.setQueryData(['projects'], [])
  client.setQueryData(['statuses'], [])
  render(<QueryClientProvider client={client}><PageKanban isMobile={isMobile} openPanel={vi.fn()} /></QueryClientProvider>)
}

describe('カンバンの作成導線', () => {
  beforeEach(() => { permissions.isAdmin = true })

  it('モバイルの作成ボタンからシートを開きキャンセルできる', async () => {
    renderKanban(true)
    await userEvent.click(screen.getByRole('button', { name: '新規プロジェクト' }))
    expect(screen.getByRole('dialog', { name: 'プロジェクト作成' })).toBeVisible()
    await userEvent.click(screen.getByRole('button', { name: 'キャンセル' }))
    expect(screen.queryByRole('dialog')).not.toBeInTheDocument()
  })

  it.each([true, false])('管理者以外は作成できない（モバイル: %s）', isMobile => {
    permissions.isAdmin = false
    renderKanban(isMobile)
    const button = screen.queryByRole('button', { name: '新規プロジェクト' })
    if (isMobile) expect(button).not.toBeInTheDocument()
    else expect(button).toBeDisabled()
  })
})

describe('カンバンの参加中/全体トグル', () => {
  beforeEach(() => { permissions.isAdmin = true; localStorage.clear() })

  it.each([true, false])('範囲トグルを表示し、全体では絞り込まない（モバイル: %s）', isMobile => {
    renderKanban(isMobile)
    const group = screen.getByRole('group', { name: '表示するプロジェクトの範囲' })
    expect(within(group).getByRole('button', { name: '全体' })).toHaveAttribute('aria-pressed', 'true')
    expect(board.projectFilter?.({ isJoined: false, memberNames: [] })).toBe(true)
  })

  it.each([true, false])('参加中に切り替えると参加していないプロジェクトを除き、選択を保存する（モバイル: %s）', async isMobile => {
    renderKanban(isMobile)
    await userEvent.click(screen.getByRole('button', { name: '参加中' }))
    expect(board.projectFilter?.({ isJoined: false, memberNames: [] })).toBe(false)
    expect(board.projectFilter?.({ isJoined: true, memberNames: [] })).toBe(true)
    expect(localStorage.getItem('cairn:projects_scope')).toBe('mine')
  })
})
