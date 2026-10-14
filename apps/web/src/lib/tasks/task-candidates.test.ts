// Copyright 2026 Cairn Contributors
// SPDX-License-Identifier: Apache-2.0

import { describe, expect, it } from 'vitest'
import { createHash } from 'node:crypto'
import { legacyCheckboxTaskIdByLine, taskCandidatesFromMessage, TASK_CANDIDATES_MAX } from './task-candidates'
import { TASK_TITLE_MAX_LENGTH } from './title-from-message'

// line は生の行の SHA-256 hex
const h = (raw: string) => createHash('sha256').update(raw).digest('hex')

const USER_ID = '00000000-0000-0000-0000-000000000001'
const OTHER_ID = '00000000-0000-0000-0000-000000000002'

describe('taskCandidatesFromMessage', () => {
  it('空でない行をそれぞれ候補にし、空行は除く', () => {
    expect(taskCandidatesFromMessage('1行目\n\n  \n2行目')).toEqual([
      { line: h('1行目'), title: '1行目', isListItem: false },
      { line: h('2行目'), title: '2行目', isListItem: false },
    ])
  })

  it('行頭のリスト・チェックボックス・番号は除いて isListItem を立てる', () => {
    expect(taskCandidatesFromMessage('- 買い出し\n* [ ] 会場予約\n- [x] 片付け\n1. 番号付き\n2) 括弧付き')).toEqual([
      { line: h('買い出し'), title: '買い出し', isListItem: true },
      { line: h('会場予約'), title: '会場予約', isListItem: true },
      { line: h('片付け'), title: '片付け', isListItem: true },
      { line: h('番号付き'), title: '番号付き', isListItem: true },
      { line: h('括弧付き'), title: '括弧付き', isListItem: true },
    ])
  })

  it('引用・見出しの記号は除くがリスト扱いにはしない。引用内のリストはリスト扱い', () => {
    expect(taskCandidatesFromMessage('## 見出し\n> 引用文\n> - [ ] 入れ子')).toEqual([
      { line: h('見出し'), title: '見出し', isListItem: false },
      { line: h('引用文'), title: '引用文', isListItem: false },
      { line: h('入れ子'), title: '入れ子', isListItem: true },
    ])
  })

  it('コードフェンス内の行は除外する', () => {
    expect(taskCandidatesFromMessage('前\n```ts\nconst a = 1\n- x\n```\n後')).toEqual([
      { line: h('前'), title: '前', isListItem: false },
      { line: h('後'), title: '後', isListItem: false },
    ])
  })

  it('記号だけの行は候補にしない', () => {
    expect(taskCandidatesFromMessage('-\n> \n- [ ] \n次の行')).toEqual([{ line: h('次の行'), title: '次の行', isListItem: false }])
  })

  it('Markdown 装飾を除去する', () => {
    expect(taskCandidatesFromMessage('**重要** な [リンク](https://example.com) と `code`')[0]?.title).toBe('重要 な リンク と code')
  })

  it('メンションは title では @表示名 に解決し、line では <@id> のままにする', () => {
    const content = `- <@${USER_ID}> レビューお願いします`
    expect(taskCandidatesFromMessage(content, id => (id === USER_ID ? '山田' : undefined))[0]).toEqual({
      line: h(`<@${USER_ID}> レビューお願いします`),
      title: '@山田 レビューお願いします',
      isListItem: true,
    })
  })

  it('表示名が同じ別人のメンションは別のキーになる', () => {
    const content = `<@${USER_ID}> お願い\n<@${OTHER_ID}> お願い`
    const candidates = taskCandidatesFromMessage(content, () => '山田')
    expect(candidates.map(c => c.title)).toEqual(['@山田 お願い', '@山田 お願い'])
    expect(candidates.map(c => c.line)).toEqual([h(`<@${USER_ID}> お願い`), h(`<@${OTHER_ID}> お願い`)])
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
    expect(candidates).toEqual([{ line: h(`<@${USER_ID}> お願い`), title: '@山田 お願い', isListItem: false }])
  })

  it('同一の行は最初の1つだけ残す', () => {
    expect(taskCandidatesFromMessage('- 同じ\n- 同じ\n- 別')).toHaveLength(2)
  })

  it('リンク先だけ違う2行は、表示名が同じでも別の候補になる', () => {
    const candidates = taskCandidatesFromMessage('[Runbook](https://a)\n[Runbook](https://b)')
    expect(candidates.map(c => c.title)).toEqual(['Runbook', 'Runbook'])
    expect(candidates).toHaveLength(2)
    expect(candidates[0]!.line).not.toBe(candidates[1]!.line)
  })

  it('先頭 200 文字が同じ長い行は別の候補になる', () => {
    const base = 'あ'.repeat(TASK_TITLE_MAX_LENGTH)
    const candidates = taskCandidatesFromMessage(`${base}A\n${base}B`)
    expect(candidates).toHaveLength(2)
    expect(candidates[0]!.title).toBe(candidates[1]!.title)
    expect(candidates[0]!.line).not.toBe(candidates[1]!.line)
  })

  it('行頭記号だけ違う同じ行は1つにまとまる', () => {
    expect(taskCandidatesFromMessage('- 同じ\n* [ ] 同じ\n同じ')).toHaveLength(1)
  })

  it('200 文字に切り詰める', () => {
    const [candidate] = taskCandidatesFromMessage('あ'.repeat(300))
    expect(Array.from(candidate!.title)).toHaveLength(TASK_TITLE_MAX_LENGTH)
    // line は切り詰めない生の行のハッシュ
    expect(candidate!.line).toBe(h('あ'.repeat(300)))
  })

  it('最大 50 件までに制限する', () => {
    const content = Array.from({ length: 80 }, (_, i) => `- タスク${i}`).join('\n')
    expect(taskCandidatesFromMessage(content)).toHaveLength(TASK_CANDIDATES_MAX)
  })

  it('本文が空なら空配列を返す', () => {
    expect(taskCandidatesFromMessage('  \n\n')).toEqual([])
  })
})

describe('legacyCheckboxTaskIdByLine', () => {
  const content = '前置き\n- [ ] 一つ目\n- [x] 二つ目\n- 普通のリスト'

  it('source_checkbox_index 番目のチェックボックス行の line に対応付ける', () => {
    const map = legacyCheckboxTaskIdByLine(content, [
      { id: 't0', title: '改名済み', sourceCheckboxIndex: 0 },
      { id: 't1', title: '二つ目', sourceCheckboxIndex: 1 },
    ])
    expect(map).toEqual(new Map([[h('一つ目'), 't0'], [h('二つ目'), 't1']]))
  })

  it('順序で引けなければ表示タイトルが同じ候補にフォールバックする', () => {
    const map = legacyCheckboxTaskIdByLine(content, [{ id: 't', title: '**普通のリスト**', sourceCheckboxIndex: 9 }])
    expect(map).toEqual(new Map([[h('普通のリスト'), 't']]))
  })

  it('対応する行がなければ何も対応付けない', () => {
    expect(legacyCheckboxTaskIdByLine(content, [{ id: 't', title: '消えた行', sourceCheckboxIndex: 9 }]).size).toBe(0)
  })
})
