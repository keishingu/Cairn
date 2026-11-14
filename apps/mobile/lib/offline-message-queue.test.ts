import { describe, expect, it, vi } from 'vitest'
import {
  createClientMessageId,
  isRetryableSendError,
  messagesForWorkspace,
  pendingMessages,
  retryQueuedMessage,
  canRetryInWorkspace,
  resolveQueueWorkspace,
  queueRestoreControls,
  parseStoredMessageQueue,
  persistThenStartSend,
  sendQueuedForUser,
} from './offline-message-queue'

describe('オフラインメッセージキュー', () => {
  it('APIのidempotencyに使えるUUIDを作る', () => {
    expect(createClientMessageId()).toMatch(
      /^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/,
    )
  })

  it('通信障害と5xxだけを自動再送する', () => {
    expect(isRetryableSendError(new TypeError('Network request failed'))).toBe(true)
    expect(isRetryableSendError({ status: 503 })).toBe(true)
    expect(isRetryableSendError({ status: 422 })).toBe(false)
  })

  it('送信中に終了したレコードを待機中へ戻して復元する', () => {
    const [message] = parseStoredMessageQueue(
      JSON.stringify([
        {
          id: '20000000-0000-4000-8000-000000000001',
          channelId: '10000000-0000-4000-8000-000000000001',
          content: '圏外から送信',
          mentionNames: { 'user-1': 'A *B*' },
          createdAt: '2026-07-22T00:00:00.000Z',
          attempts: 1,
          status: 'sending',
        },
      ]),
    )
    expect(message?.status).toBe('waiting')
    expect(message?.mentionNames).toEqual({ 'user-1': 'A *B*' })
  })

  it('選択先だけを表示し、旧項目は保持するがどのワークスペースにも割り当てない', () => {
    const common = { channelId: 'same-channel', content: 'text', createdAt: '2026-01-01' }
    const stored = JSON.stringify([
      { ...common, id: 'a', workspaceId: 'workspace-a' },
      { ...common, id: 'b', workspaceId: 'workspace-b' },
      { ...common, id: 'legacy' },
    ])
    const restored = parseStoredMessageQueue(stored)
    expect(restored).toHaveLength(3)
    expect(messagesForWorkspace(restored, 'workspace-a').map((item) => item.id)).toEqual(['a', 'legacy'])
    expect(messagesForWorkspace(restored, 'workspace-b').map((item) => item.id)).toEqual(['b', 'legacy'])
    expect(messagesForWorkspace(restored, null)).toEqual([])
    expect(pendingMessages(restored).map((item) => item.id)).toEqual(['a', 'b'])
  })

  it('圏外の起動でも保存済みの選択先でキューの表示・保存先を決める', () => {
    const workspaceId = resolveQueueWorkspace(true, 'workspace-a', undefined)
    expect(workspaceId).toBe('workspace-a')
    const messages = parseStoredMessageQueue(JSON.stringify([
      { id: 'a', channelId: 'ch', workspaceId: 'workspace-a', content: '本文', createdAt: '2026-01-01' },
      { id: 'b', channelId: 'ch', workspaceId: 'workspace-b', content: '別', createdAt: '2026-01-01' },
    ]))
    expect(messagesForWorkspace(messages, workspaceId).map((item) => item.id)).toEqual(['a'])
    expect(resolveQueueWorkspace(true, 'workspace-b', 'workspace-a')).toBe('workspace-b')
    expect(messagesForWorkspace(messages, resolveQueueWorkspace(true, 'workspace-b', 'workspace-a')).map((item) => item.id)).toEqual(['b'])
    expect(resolveQueueWorkspace(false, null, 'workspace-a')).toBeUndefined()
    expect(resolveQueueWorkspace(true, null, undefined)).toBeUndefined()
    expect(resolveQueueWorkspace(true, null, 'workspace-a')).toBe('workspace-a')
  })

  it('選択先の読み込み失敗を表示し、再試行でキューと選択先を復旧する', () => {
    let selectionError: Error | null = new Error('storage error')
    let selected: string | null = null
    let queueReady = false
    const controls = () => queueRestoreControls(null, selectionError, '選択先を読み込めません',
      () => { queueReady = true }, () => { selected = 'workspace-a'; selectionError = null })
    expect(controls().error).toBe('選択先を読み込めません')
    expect(resolveQueueWorkspace(false, selected, undefined)).toBeUndefined()
    controls().retry()
    const workspaceId = resolveQueueWorkspace(selectionError === null, selected, undefined)
    expect(controls().error).toBeNull()
    expect(queueReady && !!workspaceId).toBe(true)
    const restored = parseStoredMessageQueue(JSON.stringify([{ id: 'a', channelId: 'ch', workspaceId: 'workspace-a', content: '本文', createdAt: '2026-01-01' }]))
    expect(messagesForWorkspace(restored, workspaceId).map((item) => item.id)).toEqual(['a'])
  })

  it('旧403の本文を保持し、明示再送時だけ所属先を固定する', () => {
    const [legacy] = parseStoredMessageQueue(JSON.stringify([{ id: 'old', channelId: 'ch', content: '本文', createdAt: '2026-01-01', status: 'failed', lastError: '403' }]))
    expect(legacy).toBeDefined()
    expect(pendingMessages([legacy!])).toEqual([])
    const retry = retryQueuedMessage(legacy!, 'workspace-a')!
    expect(retry).toMatchObject({ content: '本文', workspaceId: 'workspace-a', status: 'waiting' })
    expect(retry.lastError).toBeUndefined()
    expect(pendingMessages([retry])).toEqual([retry])
    expect(retryQueuedMessage(retry, 'workspace-b')).toBeNull()
  })

  it('選択取得中や保存待ち中にワークスペースが変われば紐付けない', () => {
    expect(canRetryInWorkspace('a', 'a', 1, 1)).toBe(true)
    expect(canRetryInWorkspace('a', 'b', 1, 1)).toBe(false)
    expect(canRetryInWorkspace('a', 'a', 1, 2)).toBe(false)
  })

  it('端末保存が完了してからネットワーク送信を開始する', async () => {
    const order: string[] = []
    let finishPersist: (() => void) | undefined
    const persist = new Promise<void>((resolve) => {
      finishPersist = resolve
    })

    const operation = persistThenStartSend(
      async () => {
        order.push('persist:start')
        await persist
        order.push('persist:done')
      },
      () => order.push('send'),
    )

    expect(order).toEqual(['persist:start'])
    finishPersist?.()
    await operation
    expect(order).toEqual(['persist:start', 'persist:done', 'send'])
  })

  it('端末保存に失敗した場合はネットワーク送信を開始しない', async () => {
    const startSend = vi.fn()

    await expect(
      persistThenStartSend(async () => Promise.reject(new Error('storage failed')), startSend),
    ).rejects.toThrow('storage failed')
    expect(startSend).not.toHaveBeenCalled()
  })

  it('保存中に別アカウントに切り替わった送信を中止する', async () => {
    let current = 'A'
    const send = vi.fn()
    await persistThenStartSend(async () => { current = 'B' }, () => undefined)
    const result = await sendQueuedForUser('A', () => current === 'A', async () => ({ user: { id: 'B' } }), send)
    expect(result).toBeNull()
    expect(send).not.toHaveBeenCalled()
  })

  it('セッション取得中に切り替わった場合も送信せず、元の利用者ならそのセッションで送る', async () => {
    let current = 'A'
    const send = vi.fn(async () => 'sent')
    let resolveSession: ((session: { user: { id: string } }) => void) | undefined
    const pending = sendQueuedForUser('A', () => current === 'A', () => new Promise<{ user: { id: string } }>((resolve) => { resolveSession = resolve }), send)
    current = 'B'
    resolveSession?.({ user: { id: 'B' } })
    expect(await pending).toBeNull()
    expect(send).not.toHaveBeenCalled()
    const session = { user: { id: 'A' } }
    expect(await sendQueuedForUser('A', () => true, async () => session, send)).toBe('sent')
    expect(send).toHaveBeenCalledWith(session)
    expect(await sendQueuedForUser('A', () => true, async () => ({ user: { id: 'B' } }), send)).toBeNull()
    expect(send).toHaveBeenCalledTimes(1)
  })

})
