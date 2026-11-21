// Copyright 2026 Cairn Contributors
// SPDX-License-Identifier: Apache-2.0

import { beforeEach, describe, expect, test, vi } from 'vitest'

const WORKSPACE_ID = '10000000-0000-4000-8000-000000000001'
const ME = '20000000-0000-4000-8000-000000000001'
const COWORKER = '20000000-0000-4000-8000-000000000002'
const OTHER = '20000000-0000-4000-8000-000000000003'
const GUEST_PROJECT = '30000000-0000-4000-8000-000000000001'

const { mockResolveScope, mockDbSelect, mockAttributes, whereCalls } = vi.hoisted(() => ({
  mockResolveScope: vi.fn(),
  mockDbSelect: vi.fn(),
  mockAttributes: vi.fn(),
  whereCalls: [] as unknown[],
}))

vi.mock('./workspace-research', () => {
  class ResearchAccessError extends Error {
    readonly code = 'ACCESS_DENIED'
  }
  class ResearchInputError extends Error {
    readonly code = 'INVALID_INPUT'
  }
  return {
    ResearchAccessError,
    ResearchInputError,
    assertProjectAccess: vi.fn(),
    resolveScope: mockResolveScope,
    safeExternalUrl: () => null,
    toIso: (value: Date | string) => new Date(value).toISOString(),
    // 実装と同じ判定（DMは常に不可、ゲストは参加済みだけ）をテストで再現する
    canAccessResearchChannel: (
      channel: { id: string; type: string; isPrivate: boolean; projectId: string | null },
      scope: { role: string; guestProjectIds: string[] | null },
      joined: Set<string>,
    ) => {
      if (channel.type === 'dm') return false
      if (scope.role === 'guest') {
        if (channel.type === 'project') {
          return (
            !!channel.projectId &&
            !!scope.guestProjectIds?.includes(channel.projectId) &&
            (!channel.isPrivate || joined.has(channel.id))
          )
        }
        return joined.has(channel.id)
      }
      return !channel.isPrivate || joined.has(channel.id)
    },
  }
})
vi.mock('@/lib/profile-attributes', () => ({ getProfileAttributesByUserIds: mockAttributes }))
vi.mock('@/lib/chat/mention-name-map', () => ({ buildMentionNameMap: async () => new Map() }))
vi.mock('@/lib/chat/mentions', () => ({ hydrateMentions: (content: string) => content }))
vi.mock('@/lib/files/read-file-content', () => ({ readFileContent: vi.fn() }))
vi.mock('@/lib/permissions', () => ({ isWorkspaceAdmin: (role: string) => role === 'owner' || role === 'admin' }))
vi.mock('@cairn/db', () => {
  const table = (name: string, columns: string[]) =>
    Object.fromEntries(columns.map((column) => [column, `${name}.${column}`]))
  return {
    db: { select: mockDbSelect },
    profiles: table('profiles', ['id', 'displayName']),
    workspaceMembers: table('workspaceMembers', ['userId', 'workspaceId', 'displayName', 'role', 'membershipStatus', 'joinedAt']),
    projectMembers: table('projectMembers', ['userId', 'projectId', 'role', 'roleId']),
    projectRoles: table('projectRoles', ['id', 'name', 'workspaceId']),
    projects: table('projects', ['id', 'workspaceId', 'title', 'statusId', 'startDate', 'endDate', 'archived', 'createdAt']),
    projectStatuses: table('projectStatuses', ['id', 'name']),
    channels: table('channels', ['id', 'name', 'type', 'isPrivate', 'projectId', 'milestoneId', 'parentChannelId', 'archivedAt', 'createdAt', 'workspaceId']),
    channelMembers: table('channelMembers', ['channelId', 'userId']),
    milestones: table('milestones', ['id', 'title']),
    messages: table('messages', ['id']),
    files: table('files', ['id']),
    galleryItems: table('galleryItems', ['id', 'fileId']),
  }
})
vi.mock('drizzle-orm', () => ({
  and: (...conditions: unknown[]) => ({ op: 'and', conditions }),
  eq: (column: unknown, value: unknown) => ({ op: 'eq', column, value }),
  inArray: (column: unknown, values: unknown) => ({ op: 'inArray', column, values }),
  ne: (column: unknown, value: unknown) => ({ op: 'ne', column, value }),
  gt: (column: unknown, value: unknown) => ({ op: 'gt', column, value }),
  lte: (column: unknown, value: unknown) => ({ op: 'lte', column, value }),
  isNull: (column: unknown) => ({ op: 'isNull', column }),
  or: (...conditions: unknown[]) => ({ op: 'or', conditions }),
  asc: (column: unknown) => column,
  desc: (column: unknown) => column,
  sql: () => 'sql',
}))

// db.select() が呼ばれた順に用意した結果を返す。where の条件も記録する
function queueSelects(results: unknown[][]) {
  const queue = [...results]
  mockDbSelect.mockImplementation(() => {
    const result = queue.shift()
    if (!result) throw new Error('想定外のdb.select呼び出し')
    const promise = Promise.resolve(result)
    const value: Record<string, unknown> = {
      then: promise.then.bind(promise),
      catch: promise.catch.bind(promise),
    }
    for (const method of ['from', 'innerJoin', 'leftJoin', 'orderBy', 'groupBy', 'limit']) {
      value[method] = () => value
    }
    value['where'] = (condition: unknown) => {
      whereCalls.push(condition)
      return value
    }
    return value
  })
}

function flatten(condition: unknown): Array<{ op: string; column?: unknown; value?: unknown; values?: unknown }> {
  const node = condition as { op?: string; conditions?: unknown[] } | undefined
  if (!node || typeof node !== 'object') return []
  if (node.op === 'and' || node.op === 'or') return (node.conditions ?? []).flatMap(flatten)
  return [node as { op: string }]
}

function ctx(role: 'member' | 'guest' | 'admin' = 'member') {
  return { workspaceId: WORKSPACE_ID, userId: ME, role }
}

function memberRow(userId: string, name: string, membershipStatus: 'active' | 'inactive' = 'active') {
  return { userId, name, workspaceRole: 'member', membershipStatus, joinedAt: new Date('2026-01-01') }
}

beforeEach(() => {
  vi.clearAllMocks()
  whereCalls.length = 0
  mockResolveScope.mockResolvedValue({ role: 'member', guestProjectIds: null })
  mockAttributes.mockResolvedValue(new Map())
})

describe('get_member_history の対象解決（属性・プロジェクト役割）', () => {
  test('userIds・属性・役割のいずれも無ければ入力エラーにする', async () => {
    const { getResearchMemberHistory } = await import('./workspace-research-directory')
    await expect(getResearchMemberHistory(ctx(), { userIds: undefined })).rejects.toMatchObject({ code: 'INVALID_INPUT' })
    await expect(getResearchMemberHistory(ctx(), { userIds: [], attributeNames: [], projectRoleNames: [' '] })).rejects.toMatchObject({
      code: 'INVALID_INPUT',
    })
    expect(mockDbSelect).not.toHaveBeenCalled()
  })

  test('属性で絞るとlist_membersと同じ属性一致（完全一致・OR）の活性メンバーだけを経歴の対象にする', async () => {
    mockAttributes.mockImplementation(async (_ws: string, ids: string[]) =>
      new Map(ids.map((id) => [id, id === ME ? [{ id: 'a1', name: 'コーチ' }] : [{ id: 'a2', name: 'コーチ補佐' }]])),
    )
    // 1: 可視メンバー, 2: 履歴の対象メンバー, 3: プロジェクト参加, 4: ファイルなし(includeFiles=false)
    queueSelects([[memberRow(ME, '自分'), memberRow(COWORKER, '同僚')], [memberRow(ME, '自分')], []])
    const { getResearchMemberHistory } = await import('./workspace-research-directory')
    const result = await getResearchMemberHistory(ctx(), { attributeNames: ['コーチ'], includeFiles: false })

    expect(result).toMatchObject({ ok: true, returnedCount: 1 })
    // 候補の解決は活性メンバーのみ（非活性は条件で除外）
    const [candidateWhere, historyWhere] = whereCalls
    expect(flatten(candidateWhere)).toContainEqual({ op: 'eq', column: 'workspaceMembers.membershipStatus', value: 'active' })
    // 履歴の取得対象は属性に一致した自分だけ
    expect(flatten(historyWhere)).toContainEqual({ op: 'inArray', column: 'workspaceMembers.userId', values: [ME] })
  })

  test('ゲストの属性絞り込みはlist_membersと同じく自分と共同メンバーの範囲に限る', async () => {
    mockResolveScope.mockResolvedValue({ role: 'guest', guestProjectIds: [GUEST_PROJECT] })
    // 1: ゲストの共同メンバー取得, 2: 可視メンバー
    queueSelects([[{ userId: COWORKER }], [memberRow(COWORKER, '同僚')], []])
    const { resolveResearchMemberIdsByFilter } = await import('./workspace-research-directory')
    const ids = await resolveResearchMemberIdsByFilter(
      ctx('guest'),
      { role: 'guest', guestProjectIds: [GUEST_PROJECT] },
      { attributeNames: [], projectRoleNames: [] },
    )

    expect(ids).toEqual([COWORKER])
    const memberWhere = flatten(whereCalls[1])
    const scoped = memberWhere.find((c) => c.op === 'inArray' && c.column === 'workspaceMembers.userId')
    expect(new Set(scoped?.values as string[])).toEqual(new Set([ME, COWORKER]))
    expect(new Set(scoped?.values as string[]).has(OTHER)).toBe(false)
  })

  test('プロジェクト役割名はカスタム役割と旧データの表示名の両方で完全一致し、ゲストは参加プロジェクトに限る', async () => {
    const scope = { role: 'guest' as const, guestProjectIds: [GUEST_PROJECT] }
    mockResolveScope.mockResolvedValue(scope)
    queueSelects([
      [{ userId: COWORKER }],
      [memberRow(ME, '自分'), memberRow(COWORKER, '同僚')],
      [
        { userId: ME, role: 'member', roleName: 'コーチ' },
        { userId: COWORKER, role: 'leader', roleName: null },
      ],
    ])
    const { resolveResearchMemberIdsByFilter } = await import('./workspace-research-directory')
    const coaches = await resolveResearchMemberIdsByFilter(ctx('guest'), scope, { attributeNames: [], projectRoleNames: ['コーチ'] })
    expect(coaches).toEqual([ME])
    // 見えないプロジェクトの役割は対象にしない
    const roleWhere = flatten(whereCalls[2])
    expect(roleWhere).toContainEqual({ op: 'inArray', column: 'projects.id', values: [GUEST_PROJECT] })

    whereCalls.length = 0
    queueSelects([
      [{ userId: COWORKER }],
      [memberRow(ME, '自分'), memberRow(COWORKER, '同僚')],
      [
        { userId: ME, role: 'member', roleName: 'コーチ' },
        { userId: COWORKER, role: 'leader', roleName: null },
      ],
    ])
    const leaders = await resolveResearchMemberIdsByFilter(ctx('guest'), scope, { attributeNames: [], projectRoleNames: ['リーダー'] })
    expect(leaders).toEqual([COWORKER])
  })

  test('メンバーがワークスペース全体のときはプロジェクト絞り込みを付けず、ゲストでなければ全プロジェクトの役割を見る', async () => {
    queueSelects([
      [memberRow(ME, '自分')],
      [{ userId: ME, role: 'member', roleName: 'コーチ' }],
    ])
    const { resolveResearchMemberIdsByFilter } = await import('./workspace-research-directory')
    const ids = await resolveResearchMemberIdsByFilter(
      ctx(),
      { role: 'member', guestProjectIds: null },
      { attributeNames: [], projectRoleNames: ['コーチ'] },
    )
    expect(ids).toEqual([ME])
    expect(flatten(whereCalls[1]).some((c) => c.column === 'projects.id')).toBe(false)
  })

  test('管理者でも属性・役割フィルタでは非活性メンバーを対象にしない', async () => {
    mockResolveScope.mockResolvedValue({ role: 'admin', guestProjectIds: null })
    queueSelects([[memberRow(ME, '自分')]])
    const { resolveResearchMemberIdsByFilter } = await import('./workspace-research-directory')
    await resolveResearchMemberIdsByFilter(ctx('admin'), { role: 'admin', guestProjectIds: null }, { attributeNames: [], projectRoleNames: [] })
    expect(flatten(whereCalls[0])).toContainEqual({ op: 'eq', column: 'workspaceMembers.membershipStatus', value: 'active' })
  })

  test('フィルタとuserIdsを両方指定すると共通部分だけを返し、50人を超える分はtruncatedにする', async () => {
    const many = Array.from({ length: 60 }, (_, i) => `40000000-0000-4000-8000-${String(i).padStart(12, '0')}`)
    mockAttributes.mockImplementation(async (_ws: string, ids: string[]) =>
      new Map(ids.map((id) => [id, [{ id: 'a1', name: 'コーチ' }]])),
    )
    queueSelects([many.map((id, i) => memberRow(id, `m${i}`)), []])
    const { getResearchMemberHistory } = await import('./workspace-research-directory')
    const truncated = await getResearchMemberHistory(ctx(), { attributeNames: ['コーチ'], includeFiles: false })
    expect(truncated).toMatchObject({ ok: true, truncated: true, returnedCount: 0 })
    const historyIds = flatten(whereCalls[1]).find((c) => c.column === 'workspaceMembers.userId')?.values as string[]
    expect(historyIds).toHaveLength(50)

    whereCalls.length = 0
    queueSelects([[memberRow(ME, '自分'), memberRow(COWORKER, '同僚')], []])
    const intersected = await getResearchMemberHistory(ctx(), { userIds: [COWORKER, OTHER], attributeNames: ['コーチ'], includeFiles: false })
    const ids = flatten(whereCalls[1]).find((c) => c.column === 'workspaceMembers.userId')?.values as string[]
    expect(ids).toEqual([COWORKER])
    expect(intersected).toMatchObject({ ok: true })
  })
})

describe('read_channel_messages のチャンネル名解決', () => {
  function channelRow(overrides: Partial<Record<string, unknown>> = {}) {
    return {
      id: '50000000-0000-4000-8000-000000000001',
      name: '審議',
      type: 'workspace',
      isPrivate: false,
      projectId: null,
      projectTitle: null,
      milestoneId: null,
      parentChannelId: null,
      archivedAt: null,
      createdAt: new Date('2026-01-01'),
      ...overrides,
    }
  }

  test('channelIdとchannelNameの両方・どちらも無い指定は入力エラーにする', async () => {
    const { readResearchChannelMessages } = await import('./workspace-research-directory')
    await expect(readResearchChannelMessages(ctx(), {})).rejects.toMatchObject({ code: 'INVALID_INPUT' })
    await expect(
      readResearchChannelMessages(ctx(), { channelId: '50000000-0000-4000-8000-000000000001', channelName: '審議' }),
    ).rejects.toMatchObject({ code: 'INVALID_INPUT' })
  })

  test('先頭の#を無視して完全一致する1件を、アクセスできる非DMチャンネルから解決して読む', async () => {
    queueSelects([[channelRow(), channelRow({ id: '50000000-0000-4000-8000-000000000002', name: '審議会' })], [], []])
    const { readResearchChannelMessages } = await import('./workspace-research-directory')
    const result = await readResearchChannelMessages(ctx(), { channelName: '#審議' })
    expect(result).toMatchObject({ ok: true, channel: { id: '50000000-0000-4000-8000-000000000001', name: '審議' } })
  })

  test('DMや未参加の非公開チャンネルは、存在しない名前と同じ「見つからない」エラーで存在を明かさない', async () => {
    const { readResearchChannelMessages } = await import('./workspace-research-directory')
    const messages: string[] = []
    for (const rows of [
      [channelRow({ name: 'secret', type: 'dm' })],
      [channelRow({ name: 'secret', isPrivate: true })],
      [],
    ]) {
      queueSelects(rows.length > 0 ? [rows, []] : [rows])
      const error = await readResearchChannelMessages(ctx(), { channelName: 'secret' }).catch((e: Error & { code: string }) => e)
      expect(error).toMatchObject({ code: 'INVALID_INPUT' })
      messages.push((error as Error).message)
    }
    expect(new Set(messages).size).toBe(1)
  })

  test('ゲストは参加していないワークスペースチャンネルを名前で解決できない', async () => {
    mockResolveScope.mockResolvedValue({ role: 'guest', guestProjectIds: [GUEST_PROJECT] })
    queueSelects([[channelRow({ name: '全体' })], []])
    const { readResearchChannelMessages } = await import('./workspace-research-directory')
    await expect(readResearchChannelMessages(ctx('guest'), { channelName: '全体' })).rejects.toMatchObject({ code: 'INVALID_INPUT' })
  })

  test('同名が複数あるときは候補のID・ラベル・プロジェクトを添えたエラーにする', async () => {
    queueSelects([
      [
        channelRow({ id: '50000000-0000-4000-8000-0000000000a1', name: '全体', type: 'project', projectId: 'p1', projectTitle: '春合宿' }),
        channelRow({ id: '50000000-0000-4000-8000-0000000000a2', name: '全体', type: 'project', projectId: 'p2', projectTitle: '夏合宿' }),
      ],
      [],
    ])
    const { readResearchChannelMessages } = await import('./workspace-research-directory')
    const error = await readResearchChannelMessages(ctx(), { channelName: '全体' }).catch((e: Error) => e)
    expect(error).toMatchObject({ code: 'INVALID_INPUT' })
    const message = (error as Error).message
    for (const expected of ['#全体', '50000000-0000-4000-8000-0000000000a1', '50000000-0000-4000-8000-0000000000a2', '春合宿', '夏合宿']) {
      expect(message).toContain(expected)
    }
  })

  test('アーカイブ済みは他に該当がないときだけ候補にする', async () => {
    queueSelects([
      [
        channelRow({ id: '50000000-0000-4000-8000-0000000000b1', archivedAt: new Date('2026-02-01') }),
        channelRow({ id: '50000000-0000-4000-8000-0000000000b2' }),
      ],
      [],
      [],
    ])
    const { readResearchChannelMessages } = await import('./workspace-research-directory')
    const result = await readResearchChannelMessages(ctx(), { channelName: '審議' })
    expect(result).toMatchObject({ channel: { id: '50000000-0000-4000-8000-0000000000b2' } })
  })
})
