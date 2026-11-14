// Copyright 2026 Cairn Contributors
// SPDX-License-Identifier: Apache-2.0

import { describe, expect, test } from 'vitest'
import { skillQueryFromInput } from './ai-skill-suggestions'

describe('スキル候補を出す入力', () => {
  test('$ と名前の途中だけのときに候補を出す', () => {
    expect(skillQueryFromInput('$')).toBe('')
    expect(skillQueryFromInput('$assi')).toBe('assi')
  })

  test('名前の後ろにスペースや依頼を書いたら、先頭以外の $ なら候補を閉じる', () => {
    expect(skillQueryFromInput('$assign-reviewer ')).toBeNull()
    expect(skillQueryFromInput('費用は $')).toBeNull()
    expect(skillQueryFromInput('')).toBeNull()
  })
})
