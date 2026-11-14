// Copyright 2026 Cairn Contributors
// SPDX-License-Identifier: Apache-2.0

import { describe, expect, it } from 'vitest'
import {
  DEFAULT_FILE_FILTER_CONDITIONS,
  fileFilterConditionsSchema,
  savedFileFilterInputSchema,
} from './saved-file-filter'

describe('保存済みファイルフィルター', () => {
  it('空の条件を既定値へ正規化する', () => {
    expect(fileFilterConditionsSchema.parse({})).toEqual(DEFAULT_FILE_FILTER_CONDITIONS)
  })

  it('終了日が開始日より前なら拒否する', () => {
    const result = fileFilterConditionsSchema.safeParse({
      createdFrom: '2026-08-10',
      createdTo: '2026-08-09',
    })

    expect(result.success).toBe(false)
  })

  it('空白だけの名前を拒否する', () => {
    const result = savedFileFilterInputSchema.safeParse({ name: '   ', conditions: {} })

    expect(result.success).toBe(false)
  })
})
