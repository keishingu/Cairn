// Copyright 2026 Cairn Contributors
// SPDX-License-Identifier: Apache-2.0

import { describe, expect, test } from 'vitest'
import { filterMentionCandidates } from './mention-candidates'

const members = [
  { userId: 'owner-1', role: 'owner' as const },
  { userId: 'member-1', role: 'member' as const },
  { userId: 'guest-in', role: 'guest' as const },
  { userId: 'guest-out', role: 'guest' as const },
]

const ids = (list: { userId: string }[]) => list.map(member => member.userId)

describe('filterMentionCandidates', () => {
  test('プロジェクトチャンネルでは、参加していないゲストを候補に出さない', () => {
    const result = filterMentionCandidates(members, { kind: 'project', projectMemberIds: new Set(['guest-in']) })
    expect(ids(result)).toEqual(['owner-1', 'member-1', 'guest-in'])
  })

  test('プロジェクトメンバーの取得前は、ゲストを1人も候補に出さない', () => {
    const result = filterMentionCandidates(members, { kind: 'project', projectMemberIds: new Set() })
    expect(ids(result)).toEqual(['owner-1', 'member-1'])
  })

  test('公開チャンネルでは、チャンネルに追加されたゲストだけを候補に出す', () => {
    const result = filterMentionCandidates(members, { kind: 'workspace', channelMemberIds: new Set(['guest-in']) })
    expect(ids(result)).toEqual(['owner-1', 'member-1', 'guest-in'])
  })

  test('プライベートチャンネルと DM では、チャンネルメンバーだけを候補に出す', () => {
    const result = filterMentionCandidates(members, { kind: 'members_only', channelMemberIds: new Set(['member-1', 'guest-in']) })
    expect(ids(result)).toEqual(['member-1', 'guest-in'])
  })

  test('チャンネルの種別が分からない間は、ゲストを候補に出さない', () => {
    expect(ids(filterMentionCandidates(members, { kind: 'unresolved' }))).toEqual(['owner-1', 'member-1'])
  })
})
