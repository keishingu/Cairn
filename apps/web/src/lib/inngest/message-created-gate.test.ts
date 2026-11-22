// Copyright 2026 Cairn Contributors
// SPDX-License-Identifier: Apache-2.0

import { describe, expect, test } from 'vitest'
import { needsMessageCreatedJob } from './message-created-gate'

const plain = { channelType: 'project', content: '了解です', attachmentFileIds: [], parentMessageId: null }

describe('needsMessageCreatedJob', () => {
  test('DM・メンション・返信・添付のどれにも当たらない投稿ではジョブを送らない', () => {
    expect(needsMessageCreatedJob(plain)).toBe(false)
    expect(needsMessageCreatedJob({ ...plain, channelType: 'workspace' })).toBe(false)
  })

  test('DM はメンションがなくても送る', () => {
    expect(needsMessageCreatedJob({ ...plain, channelType: 'dm' })).toBe(true)
  })

  test('チャンネルの種別が分からないときは送る', () => {
    expect(needsMessageCreatedJob({ ...plain, channelType: undefined })).toBe(true)
    expect(needsMessageCreatedJob({ ...plain, channelType: null })).toBe(true)
  })

  test('添付と返信は送る', () => {
    expect(needsMessageCreatedJob({ ...plain, attachmentFileIds: ['file-id'] })).toBe(true)
    expect(needsMessageCreatedJob({ ...plain, parentMessageId: 'parent-id' })).toBe(true)
  })

  test.each([
    ['ユーザー', '<@11111111-1111-4111-8111-111111111111> 確認'],
    ['@all', '<@all> 確認'],
    ['@project_members', '<@project_members> 確認'],
    ['属性', '<@attr:attr-1> 確認'],
    ['役割', '<@role:role-1> 確認'],
  ])('%sメンションを含む投稿は送る', (_kind, content) => {
    expect(needsMessageCreatedJob({ ...plain, content })).toBe(true)
  })
})
