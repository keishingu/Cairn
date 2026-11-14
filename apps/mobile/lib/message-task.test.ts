import { describe, expect, test } from 'vitest'
import { initialMessageTaskRows, isValidTaskTitle, messageTaskErrorMessage, selectedTaskItems } from './message-task'

describe('initialMessageTaskRows', () => {
  test('未作成のリスト項目をすべて選択する', () => {
    const rows = initialMessageTaskRows([
      { line: '見出し', title: '見出し', isListItem: false, taskId: null },
      { line: 'a', title: 'a', isListItem: true, taskId: null },
      { line: 'b', title: 'b', isListItem: true, taskId: 't1' },
      { line: 'c', title: 'c', isListItem: true, taskId: null },
    ])
    expect(rows.map((row) => row.selected)).toEqual([false, true, false, true])
    expect(rows.map((row) => row.line)).toEqual(['見出し', 'a', 'b', 'c'])
  })

  test('リスト項目が無ければ未作成の先頭1件だけ選択する', () => {
    const rows = initialMessageTaskRows([
      { line: '済み', title: '済み', isListItem: false, taskId: 't1' },
      { line: 'a', title: 'a', isListItem: false, taskId: null },
      { line: 'b', title: 'b', isListItem: false, taskId: null },
    ])
    expect(rows.map((row) => row.selected)).toEqual([false, true, false])
  })
})

describe('selectedTaskItems / isValidTaskTitle', () => {
  test('選択行を、元の行（line）と trim した編集後タイトルの組で返す', () => {
    expect(selectedTaskItems([
      { line: 'a', title: ' a を直した ', selected: true, taskId: null },
      { line: 'b', title: 'b', selected: false, taskId: null },
      { line: 'c', title: 'a を直した', selected: true, taskId: null },
    ])).toEqual([
      { line: 'a', title: 'a を直した' },
      { line: 'c', title: 'a を直した' },
    ])
  })

  test('空・空白だけ・200 文字超のタイトルは不正', () => {
    expect(isValidTaskTitle('  ')).toBe(false)
    expect(isValidTaskTitle('あ'.repeat(201))).toBe(false)
    expect(isValidTaskTitle('あ'.repeat(200))).toBe(true)
  })
})

describe('messageTaskErrorMessage', () => {
  test('サーバーの検証メッセージがあればそのまま返す', () => {
    expect(messageTaskErrorMessage({ error: '本文にない行はタスクにできません' }, '失敗')).toBe('本文にない行はタスクにできません')
  })

  test('error が無い・空・文字列でないときは代替文言を返す', () => {
    expect(messageTaskErrorMessage({}, '失敗')).toBe('失敗')
    expect(messageTaskErrorMessage({ error: '' }, '失敗')).toBe('失敗')
    expect(messageTaskErrorMessage({ error: 1 }, '失敗')).toBe('失敗')
    expect(messageTaskErrorMessage(null, '失敗')).toBe('失敗')
  })
})
