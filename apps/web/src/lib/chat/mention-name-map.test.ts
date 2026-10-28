// Copyright 2026 Cairn Contributors
// SPDX-License-Identifier: Apache-2.0

import { describe, expect, it, vi } from 'vitest'
import { buildMentionNameMap } from './mention-name-map'
import { hydrateMentions } from './mentions'

const { query } = vi.hoisted(() => ({ query: vi.fn() }))

vi.mock('@cairn/db', async () => {
  const schema = await vi.importActual<typeof import('@cairn/db')>('@cairn/db')
  const { drizzle } = await import('drizzle-orm/node-postgres')
  return { ...schema, db: drizzle({ query } as never) }
})

describe('メンション表示名のワークスペース境界', () => {
  it('実SQLは所属履歴を必須にし、非活性の名前・属性名を維持して所属外IDは解決しない', async () => {
    query
      .mockResolvedValueOnce({ rows: [['00000000-0000-4000-8000-0000000000a1', '部内の名前'], ['00000000-0000-4000-8000-0000000000a2', '卒業生の名前']] })
      .mockResolvedValueOnce({ rows: [['00000000-0000-4000-8000-0000000000c1', 'コーチ']] })

    const names = await buildMentionNameMap('workspace-a', [
      '<@00000000-0000-4000-8000-0000000000a1> <@00000000-0000-4000-8000-0000000000a2> <@00000000-0000-4000-8000-0000000000a3> <@attr:00000000-0000-4000-8000-0000000000c1> <@all> <@project_members>',
    ])
    const userSql = query.mock.calls[0]?.[0] as { text: string }
    expect(userSql.text).toContain('inner join "workspace_members"')
    expect(userSql.text).toContain('"workspace_members"."user_id" = "profiles"."id"')
    expect(userSql.text).toContain('"workspace_members"."workspace_id" = $1')
    expect(userSql.text).not.toContain('active_workspace_members')
    expect(query.mock.calls[0]?.[1]).toEqual(['workspace-a', '00000000-0000-4000-8000-0000000000a1', '00000000-0000-4000-8000-0000000000a2', '00000000-0000-4000-8000-0000000000a3'])
    const attributeSql = query.mock.calls[1]?.[0] as { text: string }
    expect(attributeSql.text).toContain('"workspace_profile_attributes"."workspace_id" = $1')
    expect(query.mock.calls[1]?.[1]).toEqual(['workspace-a', '00000000-0000-4000-8000-0000000000c1'])
    expect(hydrateMentions('<@00000000-0000-4000-8000-0000000000a1> <@00000000-0000-4000-8000-0000000000a2> <@00000000-0000-4000-8000-0000000000a3> <@attr:00000000-0000-4000-8000-0000000000c1> <@all> <@project_members>', id => names.get(id)))
      .toBe('<@00000000-0000-4000-8000-0000000000a1|部内の名前> <@00000000-0000-4000-8000-0000000000a2|卒業生の名前> <@00000000-0000-4000-8000-0000000000a3|不明なメンバー> <@attr:00000000-0000-4000-8000-0000000000c1|コーチ> <@all|all> <@project_members|project_members>')
  })

  it('手で書かれたUUIDでないIDは問い合わせに渡さず、不明として表示する', async () => {
    query.mockReset()
    const names = await buildMentionNameMap('workspace-a', ['<@person> <@role:レビュワー> <@attr:coach>'])
    expect(query).not.toHaveBeenCalled()
    expect(hydrateMentions('<@person>', id => names.get(id))).toBe('<@person|不明なメンバー>')
  })
})

