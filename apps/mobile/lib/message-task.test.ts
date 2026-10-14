import { describe, expect, test } from 'vitest'
import { initialMessageTaskRows, isValidTaskTitle, selectedTaskTitles } from './message-task'

describe('initialMessageTaskRows', () => {
  test('未作成のリスト項目をすべて選択する', () => {
    const rows = initialMessageTaskRows([
      { title: '見出し', isListItem: false, taskId: null },
      { title: 'a', isListItem: true, taskId: null },
      { title: 'b', isListItem: true, taskId: 't1' },
      { title: 'c', isListItem: true, taskId: null },
    ])
    expect(rows.map((row) => row.selected)).toEqual([false, true, false, true])
  })

  test('リスト項目が無ければ未作成の先頭1件だけ選択する', () => {
    const rows = initialMessageTaskRows([
      { title: '済み', isListItem: false, taskId: 't1' },
      { title: 'a', isListItem: false, taskId: null },
      { title: 'b', isListItem: false, taskId: null },
    ])
    expect(rows.map((row) => row.selected)).toEqual([false, true, false])
  })
})

describe('selectedTaskTitles / isValidTaskTitle', () => {
  test('選択行のタイトルを trim して重複を除く', () => {
    expect(selectedTaskTitles([
      { title: ' a ', selected: true, taskId: null },
      { title: 'a', selected: true, taskId: null },
      { title: 'b', selected: false, taskId: null },
    ])).toEqual(['a'])
  })

  test('空・空白だけ・200 文字超のタイトルは不正', () => {
    expect(isValidTaskTitle('  ')).toBe(false)
    expect(isValidTaskTitle('あ'.repeat(201))).toBe(false)
    expect(isValidTaskTitle('あ'.repeat(200))).toBe(true)
  })
})
