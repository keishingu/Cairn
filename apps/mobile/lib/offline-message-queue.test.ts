import { describe, expect, it, vi } from 'vitest'
import {
  createClientMessageId,
  isRetryableSendError,
  parseStoredMessageQueue,
  persistThenStartSend,
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
          createdAt: '2026-07-22T00:00:00.000Z',
          attempts: 1,
          status: 'sending',
        },
      ]),
    )
    expect(message?.status).toBe('waiting')
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
})
