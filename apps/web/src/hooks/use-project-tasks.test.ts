import { renderHook, act, waitFor } from '@testing-library/react'
import { describe, it, expect, vi, beforeEach } from 'vitest'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import React from 'react'
import { useProjectTasks, useCreateTask } from './use-project-tasks'
import { fetchWithAuth } from '@/lib/fetch-with-auth'
import type { TaskDto } from '@/app/api/tasks/route'

vi.mock('@/lib/fetch-with-auth')
const mockFetch = vi.mocked(fetchWithAuth)

function makeWrapper() {
  const qc = new QueryClient({
    defaultOptions: { queries: { retry: false }, mutations: { retry: false } },
  })
  const Wrapper = ({ children }: { children: React.ReactNode }) =>
    React.createElement(QueryClientProvider, { client: qc }, children)
  return { wrapper: Wrapper, queryClient: qc }
}

const STUB_TASKS: TaskDto[] = [
  { id: 't1', projectId: 'p1', projectTitle: 'P', title: 'タスク1', status: 'todo', priority: 'medium', dueDate: null, assigneeName: null, assigneeAvatarUrl: null },
  { id: 't2', projectId: 'p1', projectTitle: 'P', title: 'タスク2', status: 'done', priority: 'low', dueDate: null, assigneeName: null, assigneeAvatarUrl: null },
]

describe('useProjectTasks', () => {
  beforeEach(() => { mockFetch.mockClear() })

  it('/api/tasks?projectId=... からタスク一覧を取得する', async () => {
    mockFetch.mockResolvedValue(new Response(JSON.stringify(STUB_TASKS), { status: 200 }))
    const { wrapper } = makeWrapper()
    const { result } = renderHook(() => useProjectTasks('p1'), { wrapper })
    await waitFor(() => expect(result.current.isSuccess).toBe(true))
    expect(result.current.data).toEqual(STUB_TASKS)
    expect(mockFetch).toHaveBeenCalledWith('/api/tasks?projectId=p1')
  })

  it('toggleMutation がタスクを楽観的に更新してから PATCH を送る', async () => {
    const { wrapper, queryClient } = makeWrapper()
    queryClient.setQueryData(['tasks', 'p1'], STUB_TASKS)

    // never-resolving mock: onMutate が完了した時点の楽観的状態を観察するため
    mockFetch.mockReturnValue(new Promise(() => {}))

    const { result } = renderHook(() => useProjectTasks('p1'), { wrapper })

    await act(async () => {
      result.current.toggleMutation.mutate({ id: 't1', newStatus: 'done' })
      // onMutate 内の cancelQueries（async）が完了するまでマイクロタスクを消費
      await new Promise(resolve => setTimeout(resolve, 0))
    })

    // 楽観的更新: API 応答前にキャッシュが書き変わっているか
    const optimistic = queryClient.getQueryData<TaskDto[]>(['tasks', 'p1'])
    expect(optimistic?.find(t => t.id === 't1')?.status).toBe('done')
    expect(mockFetch).toHaveBeenCalledWith(
      '/api/tasks/t1',
      expect.objectContaining({ method: 'PATCH' }),
    )
  })

  it('toggleMutation がエラーのとき楽観的更新をロールバックする', async () => {
    const { wrapper, queryClient } = makeWrapper()
    queryClient.setQueryData(['tasks', 'p1'], STUB_TASKS)
    mockFetch.mockResolvedValue(new Response('{}', { status: 500 }))

    const { result } = renderHook(() => useProjectTasks('p1'), { wrapper })
    act(() => {
      result.current.toggleMutation.mutate({ id: 't1', newStatus: 'done' })
    })
    await waitFor(() => expect(result.current.toggleMutation.isError).toBe(true))

    // ロールバック: 元のステータスに戻っているか
    const rolled = queryClient.getQueryData<TaskDto[]>(['tasks', 'p1'])
    expect(rolled?.find(t => t.id === 't1')?.status).toBe('todo')
  })
})

describe('useCreateTask', () => {
  beforeEach(() => { mockFetch.mockClear() })

  it('タスクを作成して onSuccess コールバックを呼ぶ', async () => {
    const newTask: TaskDto = { id: 't3', projectId: 'p1', projectTitle: 'P', title: '新タスク', status: 'todo', priority: 'high', dueDate: null, assigneeName: null, assigneeAvatarUrl: null }
    mockFetch.mockResolvedValue(new Response(JSON.stringify(newTask), { status: 200 }))
    const onSuccess = vi.fn()
    const { wrapper } = makeWrapper()

    const { result } = renderHook(() => useCreateTask('p1', onSuccess), { wrapper })
    act(() => {
      result.current.mutate({ title: '新タスク', priority: 'high' })
    })
    await waitFor(() => expect(result.current.isSuccess).toBe(true))

    expect(onSuccess).toHaveBeenCalledOnce()
    expect(mockFetch).toHaveBeenCalledWith(
      '/api/tasks',
      expect.objectContaining({ method: 'POST' }),
    )
  })

  it('作成エラー時は onSuccess コールバックを呼ばない', async () => {
    mockFetch.mockResolvedValue(new Response('{}', { status: 500 }))
    const onSuccess = vi.fn()
    const { wrapper } = makeWrapper()

    const { result } = renderHook(() => useCreateTask('p1', onSuccess), { wrapper })
    act(() => { result.current.mutate({ title: '失敗', priority: 'medium' }) })
    await waitFor(() => expect(result.current.isError).toBe(true))
    expect(onSuccess).not.toHaveBeenCalled()
  })
})
