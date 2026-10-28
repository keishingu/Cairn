// Copyright 2026 Cairn Contributors
// SPDX-License-Identifier: Apache-2.0

import { describe, expect, test, vi } from 'vitest'

vi.mock('@cairn/db', () => ({ db: {} }))

describe('オートメーションの入力の検証', () => {
  test('Skill の名前・指示文・許可する書き込みを受け付け、書き込みは決まった順にそろえる', async () => {
    const { createAutomationSchema } = await import('./automations')
    expect(
      createAutomationSchema.parse({
        kind: 'skill',
        name: ' assign-reviewer ',
        instruction: '  計画書を読んでレビュワーを招待する  ',
        writeActions: ['post_message', 'invite_project_member', 'post_message'],
      }),
    ).toEqual({
      kind: 'skill',
      name: 'assign-reviewer',
      instruction: '計画書を読んでレビュワーを招待する',
      writeActions: ['post_message', 'invite_project_member'],
    })
  })

  test('$ で呼べない名前は受け付けない', async () => {
    const { createAutomationSchema } = await import('./automations')
    for (const name of ['Assign', '-assign', '100', '1st-review', 'レビュー', 'a'.repeat(41), 'assign reviewer']) {
      expect(
        createAutomationSchema.safeParse({ kind: 'skill', name, instruction: '指示', writeActions: [] }).success,
      ).toBe(false)
    }
  })

  test('cron と heartbeat はまだ作れない', async () => {
    const { createAutomationSchema } = await import('./automations')
    const result = createAutomationSchema.safeParse({ kind: 'cron', name: 'daily', instruction: '指示', writeActions: [] })
    expect(result.success).toBe(false)
    expect(result.error?.issues[0]?.message).toBe('現在作成できるのは Skill だけです')
  })

  test('許可していない書き込みの種類や想定外の項目は受け付けない', async () => {
    const { createAutomationSchema } = await import('./automations')
    expect(
      createAutomationSchema.safeParse({ kind: 'skill', name: 'x', instruction: '指示', writeActions: ['delete_project'] }).success,
    ).toBe(false)
    expect(
      createAutomationSchema.safeParse({ kind: 'skill', name: 'x', instruction: '指示', writeActions: [], createdBy: 'someone' }).success,
    ).toBe(false)
  })

  test('更新は1項目以上を指定する', async () => {
    const { updateAutomationSchema } = await import('./automations')
    expect(updateAutomationSchema.safeParse({}).success).toBe(false)
    expect(updateAutomationSchema.parse({ enabled: false })).toEqual({ enabled: false })
  })
})
