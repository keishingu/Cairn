// Copyright 2026 Cairn Contributors
// SPDX-License-Identifier: Apache-2.0

import { describe, expect, it } from 'vitest'
import { taskCandidatesFromMessage, TASK_CANDIDATES_MAX } from './task-candidates'
import { TASK_TITLE_MAX_LENGTH } from './title-from-message'

const USER_ID = '00000000-0000-0000-0000-000000000001'
const OTHER_ID = '00000000-0000-0000-0000-000000000002'

describe('taskCandidatesFromMessage', () => {
  it('空でない行をそれぞれ候補にし、空行は除く', () => {
    expect(taskCandidatesFromMessage('1行目\n\n  \n2行目')).toEqual([
      { line: '1行目', title: '1行目', isListItem: false },
      { line: '2行目', title: '2行目', isListItem: false },
    ])
  })

  it('行頭のリスト・チェックボックス・番号は除いて isListItem を立てる', () => {
    expect(taskCandidatesFromMessage('- 買い出し\n* [ ] 会場予約\n- [x] 片付け\n1. 番号付き\n2) 括弧付き')).toEqual([
      { line: '買い出し', title: '買い出し', isListItem: true },
      { line: '会場予約', title: '会場予約', isListItem: true },
      { line: '片付け', title: '片付け', isListItem: true },
      { line: '番号付き', title: '番号付き', isListItem: true },
      { line: '括弧付き', title: '括弧付き', isListItem: true },
    ])
  })

  it('引用・見出しの記号は除くがリスト扱いにはしない。引用内のリストはリスト扱い', () => {
    expect(taskCandidatesFromMessage('## 見出し\n> 引用文\n> - [ ] 入れ子')).toEqual([
      { line: '見出し', title: '見出し', isListItem: false },
      { line: '引用文', title: '引用文', isListItem: false },
      { line: '入れ子', title: '入れ子', isListItem: true },
    ])
  })

  it('コードフェンス内の行は除外する', () => {
    expect(taskCandidatesFromMessage('前\n```ts\nconst a = 1\n- x\n```\n後')).toEqual([
      { line: '前', title: '前', isListItem: false },
      { line: '後', title: '後', isListItem: false },
    ])
  })

  it('記号だけの行は候補にしない', () => {
    expect(taskCandidatesFromMessage('-\n> \n- [ ] \n次の行')).toEqual([{ line: '次の行', title: '次の行', isListItem: false }])
  })

  it('Markdown 装飾を除去する', () => {
    expect(taskCandidatesFromMessage('**重要** な [リンク](https://example.com) と `code`')[0]?.title).toBe('重要 な リンク と code')
  })

  it('メンションは title では @表示名 に解決し、line では <@id> のままにする', () => {
    const content = `- <@${USER_ID}> レビューお願いします`
    expect(taskCandidatesFromMessage(content, id => (id === USER_ID ? '山田' : undefined))[0]).toEqual({
      line: `<@${USER_ID}> レビューお願いします`,
      title: '@山田 レビューお願いします',
      isListItem: true,
    })
  })

  it('表示名が同じ別人のメンションは別のキーになる', () => {
    const content = `<@${USER_ID}> お願い\n<@${OTHER_ID}> お願い`
    const candidates = taskCandidatesFromMessage(content, () => '山田')
    expect(candidates.map(c => c.title)).toEqual(['@山田 お願い', '@山田 お願い'])
    expect(candidates.map(c => c.line)).toEqual([`<@${USER_ID}> お願い`, `<@${OTHER_ID}> お願い`])
  })

  it('表示名が変わっても line は変わらない', () => {
    const content = `<@${USER_ID}> お願い`
    const before = taskCandidatesFromMessage(content, () => '山田')
    const after = taskCandidatesFromMessage(content, () => '山田改')
    expect(after[0]?.title).toBe('@山田改 お願い')
    expect(after[0]?.line).toBe(before[0]?.line)
    // 名前解決なしでも同じキー
    expect(taskCandidatesFromMessage(content)[0]?.line).toBe(before[0]?.line)
  })

  it('旧形式 <@id|名前> は line で <@id> に正規化し、同じメンションなら同一キーとして重複除去する', () => {
    const content = `<@${USER_ID}|旧名> お願い\n<@${USER_ID}> お願い`
    const candidates = taskCandidatesFromMessage(content, () => '山田')
    expect(candidates).toEqual([{ line: `<@${USER_ID}> お願い`, title: '@山田 お願い', isListItem: false }])
  })

  it('同一タイトルは最初の1つだけ残す', () => {
    expect(taskCandidatesFromMessage('- 同じ\n- 同じ\n- 別')).toHaveLength(2)
  })

  it('200 文字に切り詰める', () => {
    const [candidate] = taskCandidatesFromMessage('あ'.repeat(300))
    expect(Array.from(candidate!.title)).toHaveLength(TASK_TITLE_MAX_LENGTH)
    expect(Array.from(candidate!.line)).toHaveLength(TASK_TITLE_MAX_LENGTH)
  })

  it('最大 50 件までに制限する', () => {
    const content = Array.from({ length: 80 }, (_, i) => `- タスク${i}`).join('\n')
    expect(taskCandidatesFromMessage(content)).toHaveLength(TASK_CANDIDATES_MAX)
  })

  it('本文が空なら空配列を返す', () => {
    expect(taskCandidatesFromMessage('  \n\n')).toEqual([])
  })
})
