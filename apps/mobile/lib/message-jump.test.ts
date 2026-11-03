import { describe, expect, test } from 'vitest'
import { resolveMessageJumpView } from './message-jump'

const base = {
  jumpMessageId: 'm-1',
  latestLoaded: true,
  latestMessageIds: ['m-9', 'm-10'],
  historyLoaded: false,
  historyMessageCount: 0,
}

describe('resolveMessageJumpView', () => {
  test('飛び先が無ければ直近のメッセージを表示する', () => {
    expect(resolveMessageJumpView({ ...base, jumpMessageId: null })).toEqual({
      needsHistory: false,
      historyUnavailable: false,
      isHistoryView: false,
    })
  })

  test('飛び先が直近のページにあれば、そのまま直近のメッセージを表示する', () => {
    expect(resolveMessageJumpView({ ...base, latestMessageIds: ['m-1', 'm-2'] }).isHistoryView).toBe(false)
  })

  test('直近のページを取得し終えるまでは前後の取得を始めない', () => {
    expect(resolveMessageJumpView({ ...base, latestLoaded: false }).needsHistory).toBe(false)
  })

  test('飛び先が直近のページに無ければ、前後を取得して表示する', () => {
    expect(resolveMessageJumpView(base)).toEqual({
      needsHistory: true,
      historyUnavailable: false,
      isHistoryView: true,
    })
    expect(resolveMessageJumpView({ ...base, historyLoaded: true, historyMessageCount: 30 }).isHistoryView).toBe(true)
  })

  test('前後を取得しても飛び先が無ければ、見つからない扱いにして直近の表示へ戻す', () => {
    expect(resolveMessageJumpView({ ...base, historyLoaded: true, historyMessageCount: 0 })).toEqual({
      needsHistory: true,
      historyUnavailable: true,
      isHistoryView: false,
    })
  })
})
