import { render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import { PageKanban } from './projects-kanban'

const permissions = vi.hoisted(() => ({ isAdmin: true }))
vi.mock('@/hooks/use-current-user', () => ({ useWorkspacePermissions: () => permissions }))
vi.mock('@/lib/use-workspace-settings', () => ({ useProjectLabel: () => 'プロジェクト' }))
vi.mock('@/lib/command-registry', () => ({ useCommand: vi.fn() }))
vi.mock('../kanban', () => ({ KanbanBoard: () => <div>カンバン</div> }))
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
