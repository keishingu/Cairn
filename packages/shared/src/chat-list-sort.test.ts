// Copyright 2026 Cairn Contributors
// SPDX-License-Identifier: Apache-2.0

import { describe, expect, test } from 'vitest'
import { latestMessageAt, parseChatListSort, sortChatList, type ChatListSortKeys } from './chat-list-sort'

interface Item { id: string; name: string; last: string | null; start: string | null; pinned?: boolean }

const keys: ChatListSortKeys<Item> = {
  name: item => item.name,
  lastMessageAt: item => item.last,
  startDate: item => item.start,
  pinned: item => item.pinned ?? false,
}

// 作成順（API の返す順）
const items: Item[] = [
  { id: 'a', name: '夏山合宿', last: '2026-11-01T00:00:00.000Z', start: '2026-07-20' },
  { id: 'b', name: '春山合宿', last: null, start: null },
  { id: 'c', name: '沢登り練習会', last: '2026-11-05T00:00:00.000Z', start: '2026-06-08' },
  { id: 'd', name: 'クライミング講習会', last: '2026-11-03T00:00:00.000Z', start: '2026-06-08' },
]
const ids = (list: Item[]) => list.map(item => item.id)

describe('sortChatList', () => {
  test('作成順は渡された順のまま', () => {
    expect(ids(sortChatList(items, 'created', keys))).toEqual(['a', 'b', 'c', 'd'])
  })

  test('更新順は最終投稿が新しい順で、投稿のないものは末尾', () => {
    expect(ids(sortChatList(items, 'updated', keys))).toEqual(['c', 'd', 'a', 'b'])
  })

  test('実施日順は古い順で、同じ日は作成順、日付のないものは末尾', () => {
    expect(ids(sortChatList(items, 'startDate', keys))).toEqual(['c', 'd', 'a', 'b'])
  })

  test('実施日を持たない種類は実施日順でも作成順のまま', () => {
    const { startDate: _startDate, ...withoutStartDate } = keys
    expect(ids(sortChatList(items, 'startDate', withoutStartDate))).toEqual(['a', 'b', 'c', 'd'])
  })

  test('名前順は数字を数値として比べ、かなは五十音順に並べる', () => {
    const named: Item[] = [
      { id: '10', name: '第10回', last: null, start: null },
      { id: 'ka', name: 'かいぎ', last: null, start: null },
      { id: '2', name: '第2回', last: null, start: null },
      { id: 'a', name: 'あつまり', last: null, start: null },
    ]
    expect(ids(sortChatList(named, 'name', keys))).toEqual(['a', 'ka', '2', '10'])
  })

  test('ピン留めは並び順に関係なく先頭に置き、ピン留め同士は並び順に従う', () => {
    const pinned = items.map(item => ({ ...item, pinned: item.id === 'b' || item.id === 'a' }))
    expect(ids(sortChatList(pinned, 'updated', keys))).toEqual(['a', 'b', 'c', 'd'])
    expect(ids(sortChatList(pinned, 'startDate', keys))).toEqual(['a', 'b', 'c', 'd'])
  })
})

describe('parseChatListSort', () => {
  test('そのセクションで選べる値はそのまま、選べない値や未保存はセクションの既定にする', () => {
    expect(parseChatListSort('projects', 'startDate')).toBe('startDate')
    expect(parseChatListSort('channels', 'startDate')).toBe('created')
    expect(parseChatListSort('dms', 'updated')).toBe('updated')
    expect(parseChatListSort('dms', null)).toBe('name')
    expect(parseChatListSort('projects', 'unknown')).toBe('created')
  })
})

describe('latestMessageAt', () => {
  test('最新の時刻を返し、すべて null なら null', () => {
    expect(latestMessageAt([null, '2026-11-01T00:00:00.000Z', '2026-11-03T00:00:00.000Z'])).toBe('2026-11-03T00:00:00.000Z')
    expect(latestMessageAt([null, null])).toBeNull()
  })
})
