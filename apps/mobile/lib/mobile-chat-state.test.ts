import { describe, expect, it } from 'vitest'
import { hasFailedUploads, shouldRetryRealtime } from './mobile-chat-state'

describe('モバイルチャット状態', () => {
  it('JOIN が TIMED_OUT したら Realtime 購読を再接続する', () => {
    expect(shouldRetryRealtime('TIMED_OUT')).toBe(true)
  })

  it.each(['CHANNEL_ERROR', 'SUBSCRIBED'])(
    '%sではアプリ側でRealtime購読を作り直さない',
    (status) => {
      expect(shouldRetryRealtime(status)).toBe(false)
    },
  )

  it('CLOSED ではアプリ側でRealtime購読を作り直す', () => {
    expect(shouldRetryRealtime('CLOSED')).toBe(true)
  })

  it('意図的に外したチャンネルの CLOSED では再接続しない', () => {
    expect(shouldRetryRealtime('CLOSED', undefined, true)).toBe(false)
  })

  it('topic 権限拒否ではアプリ側でRealtime購読を作り直さない', () => {
    expect(shouldRetryRealtime('CHANNEL_ERROR', {
      message: 'Unauthorized: You do not have permissions to read from this Channel topic: channel:1',
    })).toBe(false)
    expect(shouldRetryRealtime('TIMED_OUT', {
      message: 'Unauthorized: You do not have permissions to read from this Channel topic: channel:1',
    })).toBe(false)
  })

  it('Unauthorized でも JWT 期限切れは topic 権限拒否と区別する', () => {
    expect(shouldRetryRealtime('CHANNEL_ERROR', {
      message: 'Unauthorized: Token has expired',
    })).toBe(false)
    expect(shouldRetryRealtime('TIMED_OUT', {
      message: 'Unauthorized: Token has expired',
    })).toBe(true)
  })

  it('失敗した添付が一件でも残っていれば送信を止める', () => {
    expect(hasFailedUploads([{ status: 'done' }, { status: 'error' }])).toBe(true)
    expect(hasFailedUploads([{ status: 'done' }, { status: 'uploading' }])).toBe(false)
  })
})
