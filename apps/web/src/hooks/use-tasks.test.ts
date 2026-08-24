import { renderHook, act, waitFor } from '@testing-library/react'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import React from 'react'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import type { TaskDto } from '@/app/api/tasks/route'
import { fetchWithAuth } from '@/lib/fetch-with-auth'
import { useTasks, useToggleTaskStatus } from './use-tasks'

vi.mock('@/lib/fetch-with-auth')
const mockFetch = vi.mocked(fetchWithAuth)

function makeWrapper() {
  const queryClient = new QueryClient({
    defaultOptions: { queries: { retry: false }, mutations: { retry: false } },
  })
  const Wrapper = ({ children }: { children: React.ReactNode }) =>
    React.createElement(QueryClientProvider, { client: queryClient }, children)
  return { wrapper: Wrapper, queryClient }
}

const STUB_TASKS: TaskDto[] = [
  { id: 't1', projectId: 'p1', projectTitle: 'P', channelId: null, channelName: null, channelIsPrivate: false, title: 'タスク1', status: 'todo', priority: 'medium', dueDate: null, assigneeId: null, assigneeName: null, assigneeAvatarUrl: null, isLinkedToMessage: false },
  { id: 't2', projectId: 'p2', projectTitle: 'Q', channelId: null, channelName: null, channelIsPrivate: false, title: 'タスク2', status: 'done', priority: 'low', dueDate: null, assigneeId: null, assigneeName: null, assigneeAvatarUrl: null, isLinkedToMessage: false },
]

describe('useTasks', () => {
  beforeEach(() => {
    mockFetch.mockReset()
  })

  it('/api/tasks からタスク一覧を取得する', async () => {
    mockFetch.mockResolvedValue(new Response(JSON.stringify(STUB_TASKS), { status: 200 }))
    const { wrapper } = makeWrapper()

    const { result } = renderHook(() => useTasks(), { wrapper })

    await waitFor(() => expect(result.current.isSuccess).toBe(true))
    expect(result.current.data).toEqual(STUB_TASKS)
    expect(mockFetch).toHaveBeenCalledWith('/api/tasks')
  })
})

describe('useToggleTaskStatus', () => {
  beforeEach(() => {
    mockFetch.mockReset()
  })

  it('タスクを楽観的に更新してから PATCH を送る', async () => {
    const { wrapper, queryClient } = makeWrapper()
    queryClient.setQueryData(['tasks'], STUB_TASKS)
    mockFetch.mockReturnValue(new Promise(() => {}))

    const { result } = renderHook(() => useToggleTaskStatus(), { wrapper })

    await act(async () => {
      result.current.mutate({ id: 't1', newStatus: 'done' })
      await new Promise(resolve => setTimeout(resolve, 0))
    })

    const optimistic = queryClient.getQueryData<TaskDto[]>(['tasks'])
    expect(optimistic?.find(task => task.id === 't1')?.status).toBe('done')
    expect(mockFetch).toHaveBeenCalledWith(
      '/api/tasks/t1',
      expect.objectContaining({ method: 'PATCH' }),
    )
  })

  it('更新エラー時は楽観的変更をロールバックする', async () => {
    const { wrapper, queryClient } = makeWrapper()
    queryClient.setQueryData(['tasks'], STUB_TASKS)
    mockFetch.mockResolvedValue(new Response('{}', { status: 500 }))

    const { result } = renderHook(() => useToggleTaskStatus(), { wrapper })

    act(() => {
      result.current.mutate({ id: 't1', newStatus: 'done' })
    })
    await waitFor(() => expect(result.current.isError).toBe(true))

    const rolledBack = queryClient.getQueryData<TaskDto[]>(['tasks'])
    expect(rolledBack?.find(task => task.id === 't1')?.status).toBe('todo')
  })
})
