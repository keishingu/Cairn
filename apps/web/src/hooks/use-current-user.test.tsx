import { render, screen, waitFor } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { QueryClient, QueryClientProvider, useQueryClient } from '@tanstack/react-query'
import React from 'react'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import type { CurrentUserDto } from '@/app/api/me/route'
import type { MessageDto } from '@/app/api/channels/[channelId]/messages/route'
import { fetchWithAuth } from '@/lib/fetch-with-auth'
import { useChannelMessages, useSendChannelMessage } from '@/lib/chat/client'
import {
  CURRENT_USER_QUERY_KEY,
  invalidateCurrentUserProfile,
  useCurrentUser,
  useWorkspacePermissions,
} from './use-current-user'

vi.mock('@/lib/fetch-with-auth', () => ({
  fetchWithAuth: vi.fn(),
}))

const mockFetch = vi.mocked(fetchWithAuth)

const STUB_USER: CurrentUserDto = {
  id: 'user-1',
  email: 'taro@example.com',
  displayName: '山田 太郎',
  avatarUrl: null,
  bio: null,
  status: 'online',
  statusMessage: null,
  wsRole: 'member',
  aiNudgesEnabled: true,
  theme: 'system',
  accentId: 'emerald',
}

function jsonResponse(data: unknown, status = 200) {
  return new Response(JSON.stringify(data), { status })
}

function makeClient() {
  return new QueryClient({
    defaultOptions: { queries: { retry: false }, mutations: { retry: false } },
  })
}

function renderWithClient(ui: React.ReactElement, queryClient = makeClient()) {
  const view = render(<QueryClientProvider client={queryClient}>{ui}</QueryClientProvider>)
  return { ...view, queryClient }
}

function message(overrides: Partial<MessageDto> = {}): MessageDto {
  return {
    id: 'message-1',
    content: 'hello',
    messageType: 'text',
    senderId: STUB_USER.id,
    senderName: profile.displayName,
    senderAvatarUrl: profile.avatarUrl,
    createdAt: '2026-09-01T00:00:00.000Z',
    isEdited: false,
    reactions: [],
    attachments: [],
    parentMessageId: null,
    replyTo: null,
    bookmarked: false,
    ...overrides,
  }
}

let profile = { ...STUB_USER }

function ProfileAndChat() {
  const queryClient = useQueryClient()
  const { data: user } = useCurrentUser()
  const send = useSendChannelMessage('channel-1', user)
  const messages = useChannelMessages('channel-1')

  return (
    <div>
      <p>{user?.displayName}</p>
      <button
        type="button"
        onClick={() => {
          profile = {
            ...profile,
            displayName: '新しい名前',
            avatarUrl: 'https://cdn.example/avatar.png',
          }
          invalidateCurrentUserProfile(queryClient)
        }}
      >
        プロフィールを反映
      </button>
      <button type="button" onClick={() => send.mutate({ content: 'こんにちは' })}>
        送信
      </button>
      <ul>
        {messages.data?.map((item) => (
          <li key={item.id}>
            {item.content} / {item.senderName} / {item.senderAvatarUrl ?? 'no-avatar'}
          </li>
        ))}
      </ul>
    </div>
  )
}

describe('現在ユーザーのQueryキャッシュ', () => {
  beforeEach(() => {
    profile = { ...STUB_USER }
    mockFetch.mockReset()
    mockFetch.mockImplementation(async (input: RequestInfo | URL, init?: RequestInit) => {
      const url = String(input)
      if (url === '/api/me') return jsonResponse(profile)
      if (url === '/api/channels/channel-1/messages' && !init?.method) return jsonResponse([message()])
      if (url === '/api/channels/channel-1/messages' && init?.method === 'POST') {
        return jsonResponse(message({ id: 'server-message', content: 'こんにちは' }))
      }
      throw new Error(`unexpected fetch: ${url}`)
    })
  })

  it('取得失敗のレスポンスをユーザー情報として保持しない', async () => {
    mockFetch.mockResolvedValue(jsonResponse({ error: 'failed', displayName: '不正な名前' }, 500))
    const queryClient = makeClient()

    function Reader() {
      const { isError, data } = useCurrentUser()
      return <div>{isError ? 'error' : (data?.displayName ?? 'empty')}</div>
    }

    renderWithClient(<Reader />, queryClient)

    expect(await screen.findByText('error')).toBeInTheDocument()
    expect(queryClient.getQueryData(CURRENT_USER_QUERY_KEY)).toBeUndefined()
    expect(queryClient.getQueryData(['current-user'])).toBeUndefined()
  })

  it('表示名とアバターの更新後、設定とチャットが同じキャッシュの新しい情報を使う', async () => {
    const user = userEvent.setup()
    const { queryClient } = renderWithClient(<ProfileAndChat />)

    expect(await screen.findByText('hello / 山田 太郎 / no-avatar')).toBeInTheDocument()
    expect(screen.getByText('山田 太郎')).toBeInTheDocument()

    await user.click(screen.getByRole('button', { name: 'プロフィールを反映' }))

    expect(await screen.findByText('hello / 新しい名前 / https://cdn.example/avatar.png')).toBeInTheDocument()
    expect(screen.getByText('新しい名前')).toBeInTheDocument()
    expect(queryClient.getQueryData<CurrentUserDto>(CURRENT_USER_QUERY_KEY)?.avatarUrl).toBe(
      'https://cdn.example/avatar.png',
    )
    expect(queryClient.getQueryData(['current-user'])).toBeUndefined()

    await user.click(screen.getByRole('button', { name: '送信' }))

    expect(
      await screen.findByText('こんにちは / 新しい名前 / https://cdn.example/avatar.png'),
    ).toBeInTheDocument()
  })

  it('ロール表示は同じキャッシュの wsRole に従う', async () => {
    const queryClient = makeClient()
    queryClient.setQueryData(CURRENT_USER_QUERY_KEY, STUB_USER)

    function RoleLabel() {
      const { wsRole, isAdmin } = useWorkspacePermissions()
      return <div>{isAdmin ? `admin:${wsRole}` : `member:${wsRole}`}</div>
    }

    renderWithClient(<RoleLabel />, queryClient)
    expect(screen.getByText('member:member')).toBeInTheDocument()

    profile = { ...STUB_USER, wsRole: 'admin' }
    await invalidateCurrentUserProfile(queryClient)

    await waitFor(() => expect(screen.getByText('admin:admin')).toBeInTheDocument())
    expect(queryClient.getQueryData(['current-user'])).toBeUndefined()
  })
})
