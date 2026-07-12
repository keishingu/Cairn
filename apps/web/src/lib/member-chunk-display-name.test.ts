// Copyright 2026 Cairn Contributors
// SPDX-License-Identifier: Apache-2.0

import { describe, expect, it } from 'vitest'
import { memberChunkDisplayName } from '@/lib/member-chunk-display-name'

describe('memberChunkDisplayName', () => {
  it('workspace display name があればそれを優先する', () => {
    expect(memberChunkDisplayName('ワークスペース名', 'プロフィール名')).toBe('ワークスペース名')
  })

  it('workspace display name が空なら profile display name にフォールバックする', () => {
    expect(memberChunkDisplayName(null, 'プロフィール名')).toBe('プロフィール名')
  })

  it('匿名化済み display name は空として扱う', () => {
    expect(memberChunkDisplayName('退会したユーザー', 'プロフィール名')).toBe('')
  })
})
