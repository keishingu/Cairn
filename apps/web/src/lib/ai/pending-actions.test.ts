// Copyright 2026 Cairn Contributors
// SPDX-License-Identifier: Apache-2.0

import { describe, expect, test, vi } from 'vitest'

vi.mock('@cairn/db', () => ({ db: {} }))

const PROJECT_ID = '30000000-0000-4000-8000-000000000001'
const CHANNEL_ID = '50000000-0000-4000-8000-000000000001'
const USER_ID = '00000000-0000-4000-8000-000000000003'

describe('実行案の内容の検証', () => {
  test('タスクはプロジェクトとチャンネルの両方を指せない', async () => {
    const { parsePendingActionPayload } = await import('./pending-actions')
    expect(() =>
      parsePendingActionPayload('create_task', {
        title: 'レビュー',
        projectId: PROJECT_ID,
        channelId: CHANNEL_ID,
        description: null,
        priority: 'medium',
        assigneeId: null,
        dueDate: null,
      }),
    ).toThrow('どちらか一方')
  })

  test('想定外の項目は保存せず落とす', async () => {
    const { parsePendingActionPayload } = await import('./pending-actions')
    expect(
      parsePendingActionPayload('invite_project_member', {
        projectId: PROJECT_ID,
        userId: USER_ID,
        roleId: null,
        workspaceId: 'ffffffff-ffff-4fff-8fff-ffffffffffff',
      }),
    ).toEqual({ projectId: PROJECT_ID, userId: USER_ID, roleId: null })
  })
})

describe('承認時の編集', () => {
  test('投稿の本文は書き換えられる', async () => {
    const { applyPendingActionEdits } = await import('./pending-actions')
    expect(
      applyPendingActionEdits('post_message', { channelId: CHANNEL_ID, text: '元の本文' }, { text: '  直した本文 ' }),
    ).toEqual({ channelId: CHANNEL_ID, text: '直した本文' })
  })

  test('宛先・対象は書き換えさせない', async () => {
    const { applyPendingActionEdits } = await import('./pending-actions')
    expect(() =>
      applyPendingActionEdits(
        'post_message',
        { channelId: CHANNEL_ID, text: '本文' },
        { channelId: '50000000-0000-4000-8000-000000000002' },
      ),
    ).toThrow('channelId を編集できません')
    expect(() =>
      applyPendingActionEdits(
        'invite_project_member',
        { projectId: PROJECT_ID, userId: USER_ID, roleId: null },
        { userId: '00000000-0000-4000-8000-000000000004' },
      ),
    ).toThrow('userId を編集できません')
  })

  test('空の本文には書き換えられない', async () => {
    const { applyPendingActionEdits } = await import('./pending-actions')
    expect(() =>
      applyPendingActionEdits('post_message', { channelId: CHANNEL_ID, text: '本文' }, { text: '   ' }),
    ).toThrow('実行案の内容が不正です')
  })
})
