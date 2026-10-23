// Copyright 2026 Cairn Contributors
// SPDX-License-Identifier: Apache-2.0

import { describe, expect, it } from 'vitest'
import { mergeMentionMembers } from './mention-expand'

describe('mergeMentionMembers', () => {
  it('userId で重複排除してマージする', () => {
    expect(
      mergeMentionMembers(
        [{ userId: 'a', displayName: 'A' }],
        [{ userId: 'b', displayName: 'B' }, { userId: 'a', displayName: 'A2' }],
      ),
    ).toEqual([
      { userId: 'a', displayName: 'A2' },
      { userId: 'b', displayName: 'B' },
    ])
  })
})
