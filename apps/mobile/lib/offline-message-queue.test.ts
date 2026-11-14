import { describe, expect, it, vi } from 'vitest'
import {
  createClientMessageId,
  isRetryableSendError,
  messagesForWorkspace,
  pendingMessages,
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
    expect(messagesForWorkspace(restored, 'workspace-a').map((item) => item.id)).toEqual(['a'])
    expect(messagesForWorkspace(restored, 'workspace-b').map((item) => item.id)).toEqual(['b'])
    expect(messagesForWorkspace(restored, null)).toEqual([])
    expect(pendingMessages(restored).map((item) => item.id)).toEqual(['a', 'b'])
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
