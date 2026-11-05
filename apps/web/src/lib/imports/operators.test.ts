// Copyright 2026 Cairn Contributors
// SPDX-License-Identifier: Apache-2.0

import { describe, expect, test } from 'vitest'
import { isImportOperator } from './operators'

describe('isImportOperator', () => {
  test('一覧に載っているユーザーは運営者として扱う', () => {
    expect(isImportOperator('u1', 'u0, u1 ,u2')).toBe(true)
  })

  test('一覧に載っていないユーザーは運営者ではない', () => {
    expect(isImportOperator('u3', 'u0,u1')).toBe(false)
  })

  test('環境変数が未設定・空なら誰も運営者ではない', () => {
    expect(isImportOperator('u1', undefined)).toBe(false)
    expect(isImportOperator('u1', '')).toBe(false)
    expect(isImportOperator('', ' , ')).toBe(false)
  })
})
