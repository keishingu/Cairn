// Copyright 2026 Cairn Contributors
// SPDX-License-Identifier: Apache-2.0

import { describe, expect, it } from 'vitest'
import { taskCandidatesFromMessage, TASK_CANDIDATES_MAX } from './task-candidates'
import { TASK_TITLE_MAX_LENGTH } from './title-from-message'

const USER_ID = '00000000-0000-0000-0000-000000000001'

describe('taskCandidatesFromMessage', () => {
  it('空でない行をそれぞれ候補にし、空行は除く', () => {
    expect(taskCandidatesFromMessage('1行目\n\n  \n2行目')).toEqual([
      { title: '1行目', isListItem: false },
      { title: '2行目', isListItem: false },
    ])
  })

  it('行頭のリスト・チェックボックス・番号は除いて isListItem を立てる', () => {
    expect(taskCandidatesFromMessage('- 買い出し\n* [ ] 会場予約\n- [x] 片付け\n1. 番号付き\n2) 括弧付き')).toEqual([
      { title: '買い出し', isListItem: true },
      { title: '会場予約', isListItem: true },
      { title: '片付け', isListItem: true },
      { title: '番号付き', isListItem: true },
      { title: '括弧付き', isListItem: true },
    ])
  })

  it('引用・見出しの記号は除くがリスト扱いにはしない。引用内のリストはリスト扱い', () => {
    expect(taskCandidatesFromMessage('## 見出し\n> 引用文\n> - [ ] 入れ子')).toEqual([
      { title: '見出し', isListItem: false },
      { title: '引用文', isListItem: false },
      { title: '入れ子', isListItem: true },
    ])
  })

  it('コードフェンス内の行は除外する', () => {
    expect(taskCandidatesFromMessage('前\n```ts\nconst a = 1\n- x\n```\n後')).toEqual([
      { title: '前', isListItem: false },
      { title: '後', isListItem: false },
    ])
  })

  it('記号だけの行は候補にしない', () => {
    expect(taskCandidatesFromMessage('-\n> \n- [ ] \n次の行')).toEqual([{ title: '次の行', isListItem: false }])
  })

  it('Markdown 装飾を除去する', () => {
    expect(taskCandidatesFromMessage('**重要** な [リンク](https://example.com) と `code`')[0]?.title).toBe('重要 な リンク と code')
  })

  it('メンションを @表示名 にする', () => {
    const content = `- <@${USER_ID}> レビューお願いします`
    expect(taskCandidatesFromMessage(content, id => (id === USER_ID ? '山田' : undefined))[0]?.title).toBe('@山田 レビューお願いします')
  })

  it('同一タイトルは最初の1つだけ残す', () => {
    expect(taskCandidatesFromMessage('- 同じ\n- 同じ\n- 別')).toHaveLength(2)
  })

  it('200 文字に切り詰める', () => {
    const [candidate] = taskCandidatesFromMessage('あ'.repeat(300))
    expect(Array.from(candidate!.title)).toHaveLength(TASK_TITLE_MAX_LENGTH)
  })

  it('最大 50 件までに制限する', () => {
    const content = Array.from({ length: 80 }, (_, i) => `- タスク${i}`).join('\n')
    expect(taskCandidatesFromMessage(content)).toHaveLength(TASK_CANDIDATES_MAX)
  })

  it('本文が空なら空配列を返す', () => {
    expect(taskCandidatesFromMessage('  \n\n')).toEqual([])
  })
})
