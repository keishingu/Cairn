import { renderHook, act, waitFor } from '@testing-library/react'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import React from 'react'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import type { TaskDto } from '@/app/api/tasks/route'
import { fetchWithAuth } from '@/lib/fetch-with-auth'
import type { TaskDetailDto } from '@/app/api/tasks/[id]/route'
import { useDeleteTask, usePatchTask, useTaskDetail, useTasks, useToggleTaskStatus } from './use-tasks'

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
  { id: 't1', projectId: 'p1', projectTitle: 'P', channelId: null, channelName: null, channelType: null, channelIsPrivate: false, title: 'タスク1', status: 'todo', priority: 'medium', dueDate: null, assigneeId: null, assigneeName: null, assigneeAvatarUrl: null, isLinkedToMessage: false, hasDescription: false },
  { id: 't2', projectId: 'p2', projectTitle: 'Q', channelId: null, channelName: null, channelType: null, channelIsPrivate: false, title: 'タスク2', status: 'done', priority: 'low', dueDate: null, assigneeId: null, assigneeName: null, assigneeAvatarUrl: null, isLinkedToMessage: false, hasDescription: false },
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

const STUB_DETAIL: TaskDetailDto = {
  ...STUB_TASKS[0]!,
  description: '手順メモ',
  hasDescription: true,
  createdAt: '2026-09-01T00:00:00.000Z',
  createdByName: '山田 太郎',
  sourceMessage: null,
}

describe('useTaskDetail', () => {
  beforeEach(() => {
    mockFetch.mockReset()
  })

  it('/api/tasks/[id] から詳細を取得し、キャッシュを ["tasks", "detail", id] に置く', async () => {
    mockFetch.mockResolvedValue(new Response(JSON.stringify(STUB_DETAIL), { status: 200 }))
    const { wrapper, queryClient } = makeWrapper()

    const { result } = renderHook(() => useTaskDetail('t1'), { wrapper })

    await waitFor(() => expect(result.current.isSuccess).toBe(true))
    expect(mockFetch).toHaveBeenCalledWith('/api/tasks/t1')
    expect(queryClient.getQueryData(['tasks', 'detail', 't1'])).toEqual(STUB_DETAIL)
  })

  it('一覧の invalidate（["tasks"]）で詳細も再取得される', async () => {
    mockFetch.mockResolvedValue(new Response(JSON.stringify(STUB_DETAIL), { status: 200 }))
    const { wrapper, queryClient } = makeWrapper()
    const { result } = renderHook(() => useTaskDetail('t1'), { wrapper })
    await waitFor(() => expect(result.current.isSuccess).toBe(true))
    expect(mockFetch).toHaveBeenCalledTimes(1)

    await act(async () => { await queryClient.invalidateQueries({ queryKey: ['tasks'] }) })

    expect(mockFetch).toHaveBeenCalledTimes(2)
  })

  it('サーバーのエラーメッセージをそのまま例外にする', async () => {
    mockFetch.mockResolvedValue(new Response(JSON.stringify({ error: 'Task not found' }), { status: 404 }))
    const { wrapper } = makeWrapper()

    const { result } = renderHook(() => useTaskDetail('t1'), { wrapper })

    await waitFor(() => expect(result.current.isError).toBe(true))
    expect(result.current.error?.message).toBe('Task not found')
  })

  it('taskId が null のときは取得しない', () => {
    const { wrapper } = makeWrapper()

    renderHook(() => useTaskDetail(null), { wrapper })

    expect(mockFetch).not.toHaveBeenCalled()
  })
})

describe('usePatchTask', () => {
  beforeEach(() => {
    mockFetch.mockReset()
  })

  it('PATCH を送り、詳細キャッシュへ先に反映する', async () => {
    const { wrapper, queryClient } = makeWrapper()
    queryClient.setQueryData(['tasks', 'detail', 't1'], STUB_DETAIL)
    mockFetch.mockReturnValue(new Promise(() => {}))

    const { result } = renderHook(() => usePatchTask(), { wrapper })

    await act(async () => {
      result.current.mutate({ id: 't1', patch: { description: null, priority: 'high' } })
      await new Promise(resolve => setTimeout(resolve, 0))
    })

    expect(mockFetch).toHaveBeenCalledWith('/api/tasks/t1', expect.objectContaining({
      method: 'PATCH',
      body: JSON.stringify({ description: null, priority: 'high' }),
    }))
    expect(queryClient.getQueryData<TaskDetailDto>(['tasks', 'detail', 't1'])).toMatchObject({
      description: null,
      hasDescription: false,
      priority: 'high',
    })
  })

  it('失敗したら詳細キャッシュを元に戻し、サーバーのエラーメッセージを返す', async () => {
    const { wrapper, queryClient } = makeWrapper()
    queryClient.setQueryData(['tasks', 'detail', 't1'], STUB_DETAIL)
    mockFetch.mockResolvedValue(new Response(JSON.stringify({ error: '指定された担当者はこのタスクに割り当てできません' }), { status: 422 }))

    const { result } = renderHook(() => usePatchTask(), { wrapper })

    await act(async () => {
      result.current.mutate({ id: 't1', patch: { title: '変更' } })
    })

    await waitFor(() => expect(result.current.isError).toBe(true))
    expect(result.current.error?.message).toBe('指定された担当者はこのタスクに割り当てできません')
    expect(queryClient.getQueryData<TaskDetailDto>(['tasks', 'detail', 't1'])?.title).toBe('タスク1')
  })
})

describe('useDeleteTask', () => {
  beforeEach(() => {
    mockFetch.mockReset()
  })

  it('DELETE を送り、詳細キャッシュを破棄する', async () => {
    const { wrapper, queryClient } = makeWrapper()
    queryClient.setQueryData(['tasks', 'detail', 't1'], STUB_DETAIL)
    mockFetch.mockResolvedValue(new Response(JSON.stringify({ id: 't1' }), { status: 200 }))

    const { result } = renderHook(() => useDeleteTask(), { wrapper })

    await act(async () => { await result.current.mutateAsync('t1') })

    expect(mockFetch).toHaveBeenCalledWith('/api/tasks/t1', { method: 'DELETE' })
    expect(queryClient.getQueryData(['tasks', 'detail', 't1'])).toBeUndefined()
  })

  it('失敗したら例外にする', async () => {
    const { wrapper } = makeWrapper()
    mockFetch.mockResolvedValue(new Response(JSON.stringify({}), { status: 500 }))

    const { result } = renderHook(() => useDeleteTask(), { wrapper })

    await act(async () => {
      await expect(result.current.mutateAsync('t1')).rejects.toThrow('タスクの削除に失敗しました')
    })
  })
})
