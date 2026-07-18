// Copyright 2026 Cairn Contributors
// SPDX-License-Identifier: Apache-2.0

import { describe, expect, it } from 'vitest'
import { parseCheckboxes, replaceCheckboxLabelAt, toggleCheckboxAt } from './checkboxes'

describe('replaceCheckboxLabelAt', () => {
  it('指定インデックスの文言だけを差し替え、チェック状態は保持する', () => {
    const content = '- [ ] 買い出し\n- [x] 会場予約\n- [ ] 片付け'
    const result = replaceCheckboxLabelAt(content, 1, '会場のダブルブッキング確認')
    expect(result).toBe('- [ ] 買い出し\n- [x] 会場のダブルブッキング確認\n- [ ] 片付け')
  })

  it('先頭のチェックボックスを差し替えても他行は変えない', () => {
    const content = '- [ ] 一番目\n- [ ] 二番目'
    expect(replaceCheckboxLabelAt(content, 0, '新しいタイトル')).toBe('- [ ] 新しいタイトル\n- [ ] 二番目')
  })

  it('対象外インデックスなら何も変わらない', () => {
    const content = '- [ ] 一番目'
    expect(replaceCheckboxLabelAt(content, 5, 'x')).toBe(content)
  })

  it('差し替え後もparse・toggleが同じインデックスで機能する', () => {
    const content = '- [ ] a\n- [ ] b'
    const replaced = replaceCheckboxLabelAt(content, 1, 'B')
    expect(parseCheckboxes(replaced)[1]!.text).toBe('B')
    expect(toggleCheckboxAt(replaced, 1, true)).toBe('- [ ] a\n- [x] B')
  })
})
