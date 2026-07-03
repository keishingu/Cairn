import React from 'react'
import { render, screen, waitFor } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import { CreateProjectSheet } from './create-project-sheet'
import { fetchWithAuth } from '@/lib/fetch-with-auth'

vi.mock('@/lib/fetch-with-auth')
vi.mock('../primitives', () => ({
  Icon: () => <span />,
}))
vi.mock('../location-input', () => ({
  LocationInput: ({ value, onClear }: { value: string; onClear: () => void }) => (
    <div>
      <span>{value}</span>
      <button type="button" onClick={onClear}>clear-location</button>
    </div>
  ),
}))

const mockFetch = vi.mocked(fetchWithAuth)

function renderSheet(props?: Partial<React.ComponentProps<typeof CreateProjectSheet>>) {
  const client = new QueryClient({ defaultOptions: { queries: { retry: false } } })
  const onClose = vi.fn()
  const onCreated = vi.fn()
  render(
    <QueryClientProvider client={client}>
      <CreateProjectSheet onClose={onClose} onCreated={onCreated} {...props} />
    </QueryClientProvider>,
  )
  return { onClose, onCreated }
}

describe('CreateProjectSheetの作成フロー', () => {
  beforeEach(() => {
    mockFetch.mockReset()
    mockFetch.mockImplementation(async (input, init) => {
      const url = String(input)
      if (url === '/api/projects/statuses') {
        return new Response(JSON.stringify([
          { id: 'status-todo', name: '未着手', color: '#999999', sortOrder: '1' },
        ]), { status: 200 })
      }
      if (url === '/api/workspaces/members') {
        return new Response(JSON.stringify([]), { status: 200 })
      }
      if (url === '/api/projects') {
        return new Response(JSON.stringify({
          id: 'project-1',
          title: '新規プロジェクト',
          description: null,
          statusName: '未着手',
          statusColor: '#999999',
          startDate: null,
          endDate: null,
          memberNames: [],
          memberAvatarUrls: [],
          memberCount: 0,
          taskCount: 0,
          completedTaskCount: 0,
          isMember: true,
          isOwner: true,
          archived: false,
          coverPhotoUrl: null,
          coverPhotoIdx: 0,
          location: null,
          placeId: null,
        }), { status: 200 })
      }
      throw new Error(`unexpected fetch: ${url} ${init?.method ?? 'GET'}`)
    })
  })

  it('モバイル作成時に先頭ステータスを付与する', async () => {
    const user = userEvent.setup()
    const { onCreated, onClose } = renderSheet({ requireStatus: true })

    await user.type(screen.getByPlaceholderText('例: 新規顧客向け導入プロジェクト'), '新規プロジェクト')
    await user.click(screen.getByRole('button', { name: '作成する' }))

    await waitFor(() => expect(onCreated).toHaveBeenCalled())
    expect(onClose).toHaveBeenCalled()

    const postCall = mockFetch.mock.calls.find(([url, init]) =>
      String(url) === '/api/projects' && init?.method === 'POST')
    expect(postCall).toBeTruthy()
    expect(JSON.parse(String(postCall?.[1]?.body))).toMatchObject({
      title: '新規プロジェクト',
      statusId: 'status-todo',
    })
  })

  it('ステータス読み込み前は送信しない', async () => {
    const user = userEvent.setup()
    let resolveStatuses!: (value: Response) => void

    mockFetch.mockImplementation((input, init) => {
      const url = String(input)
      if (url === '/api/projects/statuses') {
        return new Promise<Response>((resolve) => {
          resolveStatuses = resolve
        })
      }
      if (url === '/api/workspaces/members') {
        return Promise.resolve(new Response(JSON.stringify([]), { status: 200 }))
      }
      if (url === '/api/projects') {
        return Promise.resolve(new Response(JSON.stringify({
          id: 'project-1',
          title: '新規プロジェクト',
          description: null,
          statusName: '未着手',
          statusColor: '#999999',
          startDate: null,
          endDate: null,
          memberNames: [],
          memberAvatarUrls: [],
          memberCount: 0,
          taskCount: 0,
          completedTaskCount: 0,
          isMember: true,
          isOwner: true,
          archived: false,
          coverPhotoUrl: null,
          coverPhotoIdx: 0,
          location: null,
          placeId: null,
        }), { status: 200 }))
      }
      throw new Error(`unexpected fetch: ${url} ${init?.method ?? 'GET'}`)
    })

    renderSheet({ requireStatus: true })
    await user.type(screen.getByPlaceholderText('例: 新規顧客向け導入プロジェクト'), '新規プロジェクト')

    const submitButton = screen.getByRole('button', { name: '作成する' })
    expect(submitButton).toBeDisabled()

    resolveStatuses(new Response(JSON.stringify([
      { id: 'status-todo', name: '未着手', color: '#999999', sortOrder: '1' },
    ]), { status: 200 }))

    await waitFor(() => expect(submitButton).toBeEnabled())
    await user.click(submitButton)

    await waitFor(() => {
      expect(mockFetch.mock.calls.some(([url, init]) =>
        String(url) === '/api/projects' && init?.method === 'POST')).toBe(true)
    })
  })

  it('status 必須でない導線では status なしでも作成できる', async () => {
    const user = userEvent.setup()

    mockFetch.mockImplementation(async (input, init) => {
      const url = String(input)
      if (url === '/api/projects/statuses') {
        return new Response(JSON.stringify([]), { status: 200 })
      }
      if (url === '/api/workspaces/members') {
        return new Response(JSON.stringify([]), { status: 200 })
      }
      if (url === '/api/projects') {
        return new Response(JSON.stringify({
          id: 'project-1',
          title: '新規プロジェクト',
          description: null,
          statusName: null,
          statusColor: null,
          startDate: null,
          endDate: null,
          memberNames: [],
          memberAvatarUrls: [],
          memberCount: 0,
          taskCount: 0,
          completedTaskCount: 0,
          isMember: true,
          isOwner: true,
          archived: false,
          coverPhotoUrl: null,
          coverPhotoIdx: 0,
          location: null,
          placeId: null,
        }), { status: 200 })
      }
      throw new Error(`unexpected fetch: ${url} ${init?.method ?? 'GET'}`)
    })

    renderSheet()
    await user.type(screen.getByPlaceholderText('例: 新規顧客向け導入プロジェクト'), 'ステータスなし作成')
    await user.click(screen.getByRole('button', { name: '作成する' }))

    await waitFor(() => {
      expect(mockFetch.mock.calls.some(([url, init]) =>
        String(url) === '/api/projects' && init?.method === 'POST')).toBe(true)
    })

    const postCall = mockFetch.mock.calls.find(([url, init]) =>
      String(url) === '/api/projects' && init?.method === 'POST')
    expect(JSON.parse(String(postCall?.[1]?.body))).not.toHaveProperty('statusId')
  })
})
