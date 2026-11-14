// Copyright 2026 Cairn Contributors
// SPDX-License-Identifier: Apache-2.0

import { describe, expect, it } from 'vitest'
import { canManageAccessibleFile } from './mutation-permission'

describe('閲覧可能なファイルの変更権限', () => {
  it.each([
    ['member', '本人', true], ['guest', '本人', true],
    ['member', '他人', false], ['guest', '他人', false],
    ['admin', '他人', true], ['owner', '他人', true],
    [null, '本人', false],
  ])('%s の %s のファイルは %s', (role, owner, allowed) => {
    expect(canManageAccessibleFile('actor', owner === '本人' ? 'actor' : 'other', role)).toBe(allowed)
  })
})
