// Copyright 2026 Cairn Contributors
// SPDX-License-Identifier: Apache-2.0

import { describe, expect, it } from 'vitest'
import { taskTitleFromMessage, TASK_TITLE_MAX_LENGTH } from './title-from-message'

const USER_ID = '00000000-0000-0000-0000-000000000001'

describe('taskTitleFromMessage', () => {
  it('単純な本文はそのままタイトルにする', () => {
    expect(taskTitleFromMessage('資料を確認する')).toBe('資料を確認する')
  })

  it('最初の空でない行だけを使う', () => {
    expect(taskTitleFromMessage('\n  \n1行目\n2行目')).toBe('1行目')
  })

  it('行頭のリスト記号・チェックボックス・見出し記号・引用記号を除く', () => {
    expect(taskTitleFromMessage('- 買い出し')).toBe('買い出し')
    expect(taskTitleFromMessage('* [ ] 会場予約')).toBe('会場予約')
    expect(taskTitleFromMessage('- [x] 片付け')).toBe('片付け')
    expect(taskTitleFromMessage('## 見出し')).toBe('見出し')
    expect(taskTitleFromMessage('> 引用文')).toBe('引用文')
    expect(taskTitleFromMessage('1. 番号付き')).toBe('番号付き')
    expect(taskTitleFromMessage('> - [ ] 入れ子')).toBe('入れ子')
  })

  it('記号だけの行は飛ばして次の行を使う', () => {
    expect(taskTitleFromMessage('-\n> \n次の行')).toBe('次の行')
  })

  it('コードフェンスの行は飛ばす', () => {
    expect(taskTitleFromMessage('```\nconsole.log(1)\n```')).toBe('console.log(1)')
  })

  it('Markdown 装飾を除去する', () => {
    expect(taskTitleFromMessage('**重要** な [リンク](https://example.com) と `code`')).toBe('重要 な リンク と code')
  })

  it('メンションを @表示名 に置き換える', () => {
    const content = `<@${USER_ID}> レビューお願いします`
    expect(taskTitleFromMessage(content, id => (id === USER_ID ? '山田' : undefined))).toBe('@山田 レビューお願いします')
  })

  it('200 文字に切り詰める', () => {
    const title = taskTitleFromMessage('あ'.repeat(300))
    expect(Array.from(title)).toHaveLength(TASK_TITLE_MAX_LENGTH)
  })

  it('本文が空または記号だけなら空文字を返す', () => {
    expect(taskTitleFromMessage('')).toBe('')
    expect(taskTitleFromMessage('  \n\n ')).toBe('')
    expect(taskTitleFromMessage('- [ ] ')).toBe('')
  })
})
