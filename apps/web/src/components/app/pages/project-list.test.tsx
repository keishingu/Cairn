import React from 'react'
import { render, screen } from '@testing-library/react'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import { ProjectListView } from './project-list'
import type { ProjectDto } from '@/app/api/projects/route'

vi.mock('@/hooks/use-current-user', () => ({ useWorkspacePermissions: () => ({ isAdmin: false }) }))
vi.mock('@/lib/use-workspace-settings', () => ({ useProjectLabel: () => 'プロジェクト' }))
vi.mock('@/lib/command-registry', () => ({ useCommand: vi.fn() }))
vi.mock('../mobile/header', () => ({ MobileHeader: () => null }))

const project: ProjectDto = {
  id: 'project-1', title: '山行計画', description: null,
  statusName: '計画中', statusColor: '#3b82f6', startDate: '2026-11-15', endDate: null,
  memberCount: 2, memberNames: ['送信者', '参加者'], memberAvatarUrls: [null, null],
  taskCount: 1, completedTaskCount: 1, isHosting: true, isJoined: true, archived: false,
  coverPhotoIdx: 0, coverPhotoUrl: null, location: null, placeId: null,
}

function renderList(isMobile: boolean, latestMessage: ProjectDto['latestMessage'], isError = false) {
  const client = new QueryClient({ defaultOptions: { queries: { staleTime: Infinity, retry: false } } })
  if (isError) client.setQueryDefaults(['projects'], { queryFn: () => Promise.reject(new Error('offline')) })
  else client.setQueryData(['projects'], [{ ...project, latestMessage }])
  client.setQueryData(['statuses'], [])
  return render(<QueryClientProvider client={client}><ProjectListView isMobile={isMobile} /></QueryClientProvider>)
}

describe('プロジェクト一覧の最新チャット', () => {
  beforeEach(() => localStorage.clear())

  it.each([false, true])('送信者名と最新本文を1行で表示する（モバイル: %s）', isMobile => {
    const content = '長いメッセージです。'.repeat(30)
    const { container } = renderList(isMobile, { senderName: '送信者', content })
    const preview = screen.getByTitle(`送信者: ${content}`)
    expect(preview).toHaveTextContent(`送信者: ${content}`)
    expect(preview).toHaveStyle({ whiteSpace: 'nowrap', textOverflow: 'ellipsis' })
    expect(container.querySelector('[style*="height: 5px"]')).toBeNull()
    if (isMobile) {
      const photo = container.querySelector<HTMLElement>('[style*="background-image"]')
      expect(photo?.style.backgroundImage).toContain('w=88&h=88')
      expect(photo).toHaveStyle({ height: '100%', backgroundColor: '#1f2937' })
    }
  })

  it.each([false, true])('投稿がない場合は空状態を表示する（モバイル: %s）', isMobile => {
    renderList(isMobile, null)
    expect(screen.getByText('メッセージはまだありません')).toBeVisible()
  })

  it('本文のない添付投稿にも送信者名を表示する', () => {
    renderList(true, { senderName: '送信者', content: '' })
    expect(screen.getByTitle('送信者: （添付ファイル）')).toHaveTextContent('送信者: （添付ファイル）')
  })

  it('取得失敗を投稿のない状態として表示しない', async () => {
    renderList(false, null, true)
    expect(await screen.findByRole('alert')).toHaveTextContent('プロジェクトの取得に失敗しました')
    expect(screen.queryByText('メッセージはまだありません')).toBeNull()
  })
})
