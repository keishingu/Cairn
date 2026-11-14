import React from 'react'
import { render, screen, within } from '@testing-library/react'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import userEvent from '@testing-library/user-event'
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

describe('プロジェクト一覧の参加中/全体トグル', () => {
  const other: ProjectDto = { ...project, id: 'project-2', title: '他人の計画', isJoined: false, isHosting: false }

  function renderScoped(isMobile = false, externalSearch?: string) {
    const client = new QueryClient({ defaultOptions: { queries: { staleTime: Infinity, retry: false } } })
    client.setQueryData(['projects'], [project, other])
    client.setQueryData(['statuses'], [])
    return render(<QueryClientProvider client={client}><ProjectListView isMobile={isMobile} {...(externalSearch !== undefined ? { externalSearch } : {})} /></QueryClientProvider>)
  }

  beforeEach(() => localStorage.clear())

  it.each([false, true])('タブに「参加中」は無く、範囲トグルがある（モバイル: %s）', isMobile => {
    renderScoped(isMobile)
    const tabs = ['すべて', '主催', '進行中', 'アーカイブ']
    for (const name of tabs) expect(screen.getByRole('button', { name: new RegExp(name) })).toBeVisible()
    const group = screen.getByRole('group', { name: '表示するプロジェクトの範囲' })
    expect(within(group).getByRole('button', { name: '参加中' })).toBeVisible()
    expect(within(group).getByRole('button', { name: '全体' })).toHaveAttribute('aria-pressed', 'true')
  })

  it('「参加中」に切り替えると参加プロジェクトだけを表示し、件数もその範囲で数える', async () => {
    renderScoped()
    expect(screen.getByText('他人の計画')).toBeVisible()
    await userEvent.click(screen.getByRole('button', { name: '参加中' }))
    expect(screen.queryByText('他人の計画')).toBeNull()
    expect(screen.getByText('山行計画')).toBeVisible()
    expect(screen.getByRole('button', { name: /^すべて\s*1$/ })).toBeVisible()
    expect(localStorage.getItem('cairn:projects_scope')).toBe('mine')
  })

  it('検索中も「参加中」の範囲に従い、参加していないプロジェクトを出さない', () => {
    localStorage.setItem('cairn:projects_scope', 'mine')
    renderScoped(false, '計画')
    expect(screen.getByText('山行計画')).toBeVisible()
    expect(screen.queryByText('他人の計画')).toBeNull()
  })

  it('旧「参加中」タブの保存値はすべてタブ+参加中へ移行する', () => {
    localStorage.setItem('cairn:projects_filter', 'joined')
    renderScoped()
    expect(screen.queryByText('他人の計画')).toBeNull()
    expect(within(screen.getByRole('group', { name: '表示するプロジェクトの範囲' })).getByRole('button', { name: '参加中' })).toHaveAttribute('aria-pressed', 'true')
  })
})
