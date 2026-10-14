// Copyright 2026 Cairn Contributors
// SPDX-License-Identifier: Apache-2.0

import { describe, expect, it } from 'vitest'
import { toggleCheckboxAt } from './checkboxes'

describe('toggleCheckboxAt', () => {
  it('指定インデックスのチェックボックスだけを切り替える', () => {
    const content = '- [ ] a\n- [ ] b\n- [x] c'
    expect(toggleCheckboxAt(content, 1, true)).toBe('- [ ] a\n- [x] b\n- [x] c')
    expect(toggleCheckboxAt(content, 2, false)).toBe('- [ ] a\n- [ ] b\n- [ ] c')
  })

  it('対象外インデックスなら何も変わらない', () => {
    const content = '- [ ] a'
    expect(toggleCheckboxAt(content, 5, true)).toBe(content)
  })

  it('チェックボックス以外の行は変えない', () => {
    const content = '見出し\n- [ ] a\n- 通常のリスト'
    expect(toggleCheckboxAt(content, 0, true)).toBe('見出し\n- [x] a\n- 通常のリスト')
  })
})
