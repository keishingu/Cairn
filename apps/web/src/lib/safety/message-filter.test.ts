// Copyright 2026 Cairn Contributors
// SPDX-License-Identifier: Apache-2.0

import { describe, expect, test } from 'vitest'
import { unsafeMessageError } from './message-filter'

describe('投稿フィルター', () => {
  test('明白な脅迫とスパムを拒否する', () => {
    expect(unsafeMessageError('お前を殺すぞ')).toBeTruthy()
    expect(unsafeMessageError('今すぐDMで副業、月10万円保証')).toBeTruthy()
  })

  test('通常の日本語メッセージを拒否しない', () => {
    expect(unsafeMessageError('明日の登山計画について、集合時間を確認したいです。')).toBeNull()
  })
})
