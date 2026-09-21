import { describe, expect, it } from 'vitest'
import { hasFailedUploads, shouldRetryRealtime } from './mobile-chat-state'

describe('モバイルチャット状態', () => {
  it('JOIN が TIMED_OUT したら Realtime 購読を再接続する', () => {
    expect(shouldRetryRealtime('TIMED_OUT')).toBe(true)
  })

  it.each(['CHANNEL_ERROR', 'CLOSED', 'SUBSCRIBED'])(
    '%sではアプリ側でRealtime購読を作り直さない',
    (status) => {
      expect(shouldRetryRealtime(status)).toBe(false)
    },
  )

  it('失敗した添付が一件でも残っていれば送信を止める', () => {
    expect(hasFailedUploads([{ status: 'done' }, { status: 'error' }])).toBe(true)
    expect(hasFailedUploads([{ status: 'done' }, { status: 'uploading' }])).toBe(false)
  })
})
