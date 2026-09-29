import { translate } from '@cairn/shared'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import {
  projectChannelsQueryKey,
  workspaceChannelsQueryKey,
  workspaceDmsQueryKey,
} from './channel-list-queries'
import { followNotification } from './follow-notification'
import { queryClient } from './query-client'

const { mockGetSession, mockGetSelectedWorkspaceId, mockSetSelectedWorkspaceId, mockApiFetch } =
  vi.hoisted(() => ({
    mockGetSession: vi.fn(),
    mockGetSelectedWorkspaceId: vi.fn(),
    mockSetSelectedWorkspaceId: vi.fn(),
    mockApiFetch: vi.fn(),
  }))

vi.mock('./supabase', () => ({
  supabase: { auth: { getSession: mockGetSession } },
}))

vi.mock('./workspace-selection', () => ({
  getSelectedWorkspaceId: mockGetSelectedWorkspaceId,
  setSelectedWorkspaceId: mockSetSelectedWorkspaceId,
}))

vi.mock('./api-fetch', () => ({
  apiFetch: mockApiFetch,
}))

const t = (message: string, values?: Record<string, string | number>) =>
  translate('ja', message, values)

const projectChannel = {
  channelId: 'project-channel',
  channelName: '定例',
  projectTitle: '山行',
  projectId: 'project-1',
  milestoneId: null,
}

const membership = {
  id: 'ws-b',
  name: '別の作業場',
  slug: 'b',
  logoUrl: null,
  role: 'member' as const,
}

function jsonResponse(body: unknown, status = 200) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { 'Content-Type': 'application/json' },
  })
}

describe('通知からチャットを開く', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    vi.spyOn(console, 'warn').mockImplementation(() => undefined)
    queryClient.clear()
    mockGetSession.mockResolvedValue({ data: { session: { user: { id: 'user-1' } } } })
    mockGetSelectedWorkspaceId.mockResolvedValue('ws-a')
    mockSetSelectedWorkspaceId.mockResolvedValue(undefined)
    mockApiFetch.mockImplementation(async (path: string) => {
      if (path === '/api/workspaces/list') return jsonResponse([membership])
      if (path === '/api/projects/channels') return jsonResponse([projectChannel])
      if (path === '/api/workspaces/channels') {
        return jsonResponse([{ id: 'ws-channel', name: '雑談', isPrivate: true }])
      }
      if (path === '/api/workspaces/dms') {
        return jsonResponse([{ id: 'dm-1', participantName: '相手' }])
      }
      return jsonResponse([], 404)
    })
  })

  afterEach(() => {
    vi.restoreAllMocks()
  })

  it('キャッシュが空でも一覧を取得してからチャンネルを開く', async () => {
    const push = vi.fn()

    await followNotification({ push }, { kind: 'channel', channelId: 'project-channel' }, { t })

    expect(mockApiFetch).toHaveBeenCalledWith('/api/projects/channels')
    expect(mockApiFetch).toHaveBeenCalledWith('/api/workspaces/channels')
    expect(mockApiFetch).toHaveBeenCalledWith('/api/workspaces/dms')
    expect(push).toHaveBeenCalledWith({
      pathname: '/chats/[channelId]',
      params: {
        channelId: 'project-channel',
        channelName: '山行',
        channelType: 'project',
        projectId: 'project-1',
      },
    })
  })

  it('新しいキャッシュがある間は一覧を取り直さない', async () => {
    queryClient.setQueryData(projectChannelsQueryKey, [projectChannel])
    queryClient.setQueryData(workspaceChannelsQueryKey, [])
    queryClient.setQueryData(workspaceDmsQueryKey, [])

    await followNotification({ push: vi.fn() }, { kind: 'channel', channelId: 'project-channel' }, { t })

    expect(mockApiFetch).not.toHaveBeenCalled()
  })

  it('別ワークスペースの Push は所属確認のあと切り替えてから開く', async () => {
    const calls: string[] = []
    mockGetSelectedWorkspaceId.mockResolvedValue(null)
    mockSetSelectedWorkspaceId.mockImplementation(async () => {
      calls.push('select')
    })
    mockApiFetch.mockImplementation(async (path: string) => {
      calls.push(path)
      if (path === '/api/workspaces/list') return jsonResponse([membership])
      if (path === '/api/projects/channels') return jsonResponse([projectChannel])
      if (path === '/api/workspaces/channels') return jsonResponse([])
      if (path === '/api/workspaces/dms') return jsonResponse([])
      return jsonResponse([], 404)
    })
    const push = vi.fn()

    await followNotification(
      { push },
      { kind: 'channel', channelId: 'project-channel' },
      { workspaceId: 'ws-b', t },
    )

    expect(calls.indexOf('select')).toBeGreaterThan(calls.indexOf('/api/workspaces/list'))
    expect(calls.indexOf('/api/projects/channels')).toBeGreaterThan(calls.indexOf('select'))
    expect(mockSetSelectedWorkspaceId).toHaveBeenCalledWith('user-1', 'ws-b')
    expect(queryClient.getQueryData(['workspace'])).toEqual({
      id: 'ws-b',
      name: '別の作業場',
      logoUrl: null,
    })
    expect(push).toHaveBeenCalledWith(
      expect.objectContaining({
        params: expect.objectContaining({ channelName: '山行', projectId: 'project-1' }),
      }),
    )
  })

  it('未所属のワークスペースには切り替えず遷移しない', async () => {
    const push = vi.fn()

    await followNotification(
      { push },
      { kind: 'screen', path: '/(app)/tasks' },
      { workspaceId: 'ws-x', t },
    )

    expect(mockSetSelectedWorkspaceId).not.toHaveBeenCalled()
    expect(push).not.toHaveBeenCalled()
    expect(mockApiFetch).not.toHaveBeenCalledWith('/api/projects/channels')
  })

  it('所属一覧を確認できないときは切り替えず遷移しない', async () => {
    mockApiFetch.mockRejectedValue(new Error('offline'))
    const push = vi.fn()

    await followNotification(
      { push },
      { kind: 'screen', path: '/(app)/tasks' },
      { workspaceId: 'ws-b', t },
    )

    expect(mockSetSelectedWorkspaceId).not.toHaveBeenCalled()
    expect(push).not.toHaveBeenCalled()
  })

  it('同じワークスペースなら所属確認をせず開く', async () => {
    mockGetSelectedWorkspaceId.mockResolvedValue('ws-b')
    const push = vi.fn()

    await followNotification(
      { push },
      { kind: 'screen', path: '/(app)/tasks' },
      { workspaceId: 'ws-b', t },
    )

    expect(mockApiFetch).not.toHaveBeenCalledWith('/api/workspaces/list')
    expect(mockSetSelectedWorkspaceId).not.toHaveBeenCalled()
    expect(push).toHaveBeenCalledWith('/(app)/tasks')
  })

  it('一覧の取得に失敗してもチャンネル自体は開く', async () => {
    mockApiFetch.mockRejectedValue(new Error('offline'))
    const push = vi.fn()

    await followNotification({ push }, { kind: 'channel', channelId: 'missing' }, { t })

    expect(push).toHaveBeenCalledWith({
      pathname: '/chats/[channelId]',
      params: { channelId: 'missing' },
    })
  })
})
