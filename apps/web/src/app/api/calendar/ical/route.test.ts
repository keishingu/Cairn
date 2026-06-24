// Copyright 2026 Cairn Contributors
// SPDX-License-Identifier: Apache-2.0

import { afterEach, describe, expect, it, vi } from 'vitest'
import { NextRequest } from 'next/server'

const USER_ID = '00000000-0000-0000-0000-000000000001'
const WS_ID = 'ws-00000001'
const TOKEN = 'ical-token'

const { mockDb } = vi.hoisted(() => {
  const mockDb = { select: vi.fn(), selectDistinct: vi.fn() }
  return { mockDb }
})

vi.mock('@cairn/db', () => ({
  db: mockDb,
  profiles: { id: 'pr.id', icalToken: 'pr.icalToken' },
  projects: { id: 'p.id', workspaceId: 'p.workspaceId', title: 'p.title', startDate: 'p.startDate', endDate: 'p.endDate', archived: 'p.archived', createdBy: 'p.createdBy' },
  projectMembers: { projectId: 'pm.projectId', userId: 'pm.userId' },
  workspaceMembers: { workspaceId: 'wm.workspaceId', userId: 'wm.userId', role: 'wm.role' },
}))

vi.mock('drizzle-orm', () => ({
  eq: vi.fn(() => 'eq'),
  and: vi.fn(() => 'and'),
  or: vi.fn(() => 'or'),
  isNotNull: vi.fn(() => 'isNotNull'),
}))

function chain(result: unknown[]) {
  const p = Promise.resolve(result)
  const c: Record<string, unknown> = {
    then: p.then.bind(p),
    catch: p.catch.bind(p),
    finally: p.finally.bind(p),
  }
  for (const m of ['from', 'leftJoin', 'where']) {
    c[m] = vi.fn().mockReturnValue(c)
  }
  return c
}

function buildRequest(scope: 'me' | 'workspace') {
  return new NextRequest(`https://cairn.example/api/calendar/ical?token=${TOKEN}&scope=${scope}`)
}

describe('GET /api/calendar/ical', () => {
  afterEach(() => {
    vi.clearAllMocks()
    vi.resetModules()
  })

  it('member は workspace scope を取得できない', async () => {
    mockDb.select
      .mockReturnValueOnce(chain([{ id: USER_ID }]))
      .mockReturnValueOnce(chain([{ workspaceId: WS_ID, role: 'member' }]))

    const { GET } = await import('./route')
    const res = await GET(buildRequest('workspace'))

    expect(res.status).toBe(403)
    expect(await res.text()).toBe('Forbidden')
    expect(mockDb.select).toHaveBeenCalledTimes(2)
  })

  it('guest は workspace scope を取得できない', async () => {
    mockDb.select
      .mockReturnValueOnce(chain([{ id: USER_ID }]))
      .mockReturnValueOnce(chain([{ workspaceId: WS_ID, role: 'guest' }]))

    const { GET } = await import('./route')
    const res = await GET(buildRequest('workspace'))

    expect(res.status).toBe(403)
    expect(await res.text()).toBe('Forbidden')
    expect(mockDb.select).toHaveBeenCalledTimes(2)
  })

  it('admin は workspace scope でワークスペース全体の予定を取得できる', async () => {
    mockDb.select
      .mockReturnValueOnce(chain([{ id: USER_ID }]))
      .mockReturnValueOnce(chain([{ workspaceId: WS_ID, role: 'admin' }]))
      .mockReturnValueOnce(chain([{ id: 'proj-1', title: '全体予定', startDate: '2026-06-01', endDate: '2026-06-02' }]))

    const { GET } = await import('./route')
    const res = await GET(buildRequest('workspace'))
    const body = await res.text()

    expect(res.status).toBe(200)
    expect(res.headers.get('Content-Type')).toContain('text/calendar')
    expect(body).toContain('X-WR-CALNAME:Cairn（全体）')
    expect(body).toContain('SUMMARY:全体予定')
  })

  it('member でも me scope なら自分の予定を取得できる', async () => {
    mockDb.select
      .mockReturnValueOnce(chain([{ id: USER_ID }]))
      .mockReturnValueOnce(chain([{ workspaceId: WS_ID, role: 'member' }]))
    mockDb.selectDistinct
      .mockReturnValueOnce(chain([{ id: 'proj-2', title: '自分の予定', startDate: '2026-06-03', endDate: null }]))

    const { GET } = await import('./route')
    const res = await GET(buildRequest('me'))
    const body = await res.text()

    expect(res.status).toBe(200)
    expect(body).toContain('X-WR-CALNAME:Cairn（自分）')
    expect(body).toContain('SUMMARY:自分の予定')
  })
})
