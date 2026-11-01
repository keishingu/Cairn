import { describe, expect, test } from 'vitest'
import {
  canReplyToMessage,
  canSwipeReply,
  isSwipeReplyStart,
  reachedSwipeReply,
  SWIPE_REPLY_EDGE_INSET,
  SWIPE_REPLY_THRESHOLD,
  swipeReplyOffset,
} from './swipe-reply'

describe('canReplyToMessage', () => {
  test('通常のメッセージとカードには返信できる', () => {
    expect(canReplyToMessage({ messageType: 'text' })).toBe(true)
    expect(canReplyToMessage({ messageType: 'blocks' })).toBe(true)
  })

  test('システムメッセージには返信できない', () => {
    expect(canReplyToMessage({ messageType: 'system' })).toBe(false)
  })

  test('ブロック中のメッセージにも長押しメニューからは返信できる', () => {
    expect(canReplyToMessage({ messageType: 'text', blocked: true })).toBe(true)
  })
})

describe('canSwipeReply', () => {
  test('返信できるメッセージはスワイプできる', () => {
    expect(canSwipeReply({ messageType: 'text', blocked: false })).toBe(true)
  })

  test('システムメッセージはスワイプできない', () => {
    expect(canSwipeReply({ messageType: 'system' })).toBe(false)
  })

  test('本文を隠しているブロック中のメッセージはスワイプできない', () => {
    expect(canSwipeReply({ messageType: 'text', blocked: true })).toBe(false)
  })
})

describe('isSwipeReplyStart', () => {
  const screenWidth = 390

  test('画面右端から始まる指はジェスチャーナビの戻るに譲る', () => {
    expect(isSwipeReplyStart(screenWidth, screenWidth)).toBe(false)
    expect(isSwipeReplyStart(screenWidth - SWIPE_REPLY_EDGE_INSET + 1, screenWidth)).toBe(false)
  })

  test('右端より内側から始まる指は受け付ける', () => {
    expect(isSwipeReplyStart(screenWidth - SWIPE_REPLY_EDGE_INSET, screenWidth)).toBe(true)
    expect(isSwipeReplyStart(200, screenWidth)).toBe(true)
  })
})

describe('reachedSwipeReply', () => {
  test('左へ 56pt 引いたら返信の閾値に達する', () => {
    expect(SWIPE_REPLY_THRESHOLD).toBe(56)
    expect(reachedSwipeReply(-55.9)).toBe(false)
    expect(reachedSwipeReply(-56)).toBe(true)
  })

  test('右へ動かしても閾値に達しない', () => {
    expect(reachedSwipeReply(80)).toBe(false)
  })
})

describe('swipeReplyOffset', () => {
  test('右へは動かさない', () => {
    expect(swipeReplyOffset(30)).toBe(0)
  })

  test('閾値までは指に追従する', () => {
    expect(swipeReplyOffset(-40)).toBe(-40)
    expect(swipeReplyOffset(-SWIPE_REPLY_THRESHOLD)).toBe(-SWIPE_REPLY_THRESHOLD)
  })

  test('閾値を超えた分は弱めて動かす', () => {
    expect(swipeReplyOffset(-66)).toBeCloseTo(-59)
  })

  test('どれだけ引いても上限で止まる', () => {
    expect(swipeReplyOffset(-1000)).toBe(-80)
  })
})
