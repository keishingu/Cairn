import { describe, expect, it } from 'vitest'
import { hasFailedUploads, shouldRetryRealtime } from './mobile-chat-state'

describe('mobile chat state', () => {
  it.each(['CHANNEL_ERROR', 'TIMED_OUT', 'CLOSED'])(
    '%sになったRealtime購読を再接続する',
    (status) => {
      expect(shouldRetryRealtime(status)).toBe(true)
    },
  )

  it('正常なRealtime状態では再接続しない', () => {
    expect(shouldRetryRealtime('SUBSCRIBED')).toBe(false)
  })

  it('失敗した添付が一件でも残っていれば送信を止める', () => {
    expect(hasFailedUploads([{ status: 'done' }, { status: 'error' }])).toBe(true)
    expect(hasFailedUploads([{ status: 'done' }, { status: 'uploading' }])).toBe(false)
  })
})
