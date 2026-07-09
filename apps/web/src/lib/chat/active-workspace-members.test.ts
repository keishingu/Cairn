// Copyright 2026 Cairn Contributors
// SPDX-License-Identifier: Apache-2.0

import { describe, expect, it } from 'vitest'
import { filterActiveWorkspaceMembers } from './active-workspace-members'

describe('filterActiveWorkspaceMembers', () => {
  it('inactive メンバーを chat 候補から除外する', () => {
    const result = filterActiveWorkspaceMembers([
      {
        userId: 'active-1',
        displayName: 'Active',
        email: null,
        avatarUrl: null,
        role: 'member',
        membershipStatus: 'active',
        joinedAt: '2026-01-01',
        projectCount: 1,
      },
      {
        userId: 'inactive-1',
        displayName: 'Inactive',
        email: null,
        avatarUrl: null,
        role: 'member',
        membershipStatus: 'inactive',
        joinedAt: '2026-01-01',
        projectCount: 1,
      },
    ])

    expect(result.map((member) => member.userId)).toEqual(['active-1'])
  })
})
