// Copyright 2026 Cairn Contributors
// SPDX-License-Identifier: Apache-2.0

import { describe, expect, it } from 'vitest'
import { decodeLinkedTasksKey, encodeLinkedTasksKey } from './linked-tasks-key'

describe('linked-tasks-key', () => {
  it('タスク一覧を作成順のまま文字列にして復元できる', () => {
    const tasks = [
      { id: 'a', title: '資料を確認: 明日まで', status: 'done' as const },
      { id: 'b', title: 'カンマ, と 改行なし', status: 'in_progress' as const },
    ]
    expect(decodeLinkedTasksKey(encodeLinkedTasksKey(tasks))).toEqual(tasks)
  })

  it('同じ内容なら同じキーになり、状態やタイトルが変わればキーも変わる', () => {
    const base = [{ id: 'a', title: 'x', status: 'todo' as const }]
    expect(encodeLinkedTasksKey(base)).toBe(encodeLinkedTasksKey([{ ...base[0]! }]))
    expect(encodeLinkedTasksKey(base)).not.toBe(encodeLinkedTasksKey([{ ...base[0]!, status: 'done' }]))
    expect(encodeLinkedTasksKey(base)).not.toBe(encodeLinkedTasksKey([{ ...base[0]!, title: 'y' }]))
  })

  it('空配列は空文字になり、空文字は空配列に戻る', () => {
    expect(encodeLinkedTasksKey([])).toBe('')
    expect(decodeLinkedTasksKey('')).toEqual([])
  })
})
