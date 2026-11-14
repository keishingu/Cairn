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
  projects: {
    id: 'p.id',
    workspaceId: 'p.workspaceId',
    title: 'p.title',
    startDate: 'p.startDate',
    endDate: 'p.endDate',
    archived: 'p.archived',
    createdBy: 'p.createdBy',
  },
  milestones: {
    id: 'm.id',
    projectId: 'm.projectId',
    title: 'm.title',
    description: 'm.description',
    startDate: 'm.startDate',
    endDate: 'm.endDate',
    startTime: 'm.startTime',
    endTime: 'm.endTime',
  },
  projectMembers: { projectId: 'pm.projectId', userId: 'pm.userId' },
  workspaceMembers: { workspaceId: 'wm.workspaceId', userId: 'wm.userId', role: 'wm.role' },
  activeWorkspaceMembers: {
    workspaceId: 'awm.workspaceId',
    userId: 'awm.userId',
    role: 'awm.role',
  },
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
  for (const m of ['from', 'innerJoin', 'leftJoin', 'where']) {
    c[m] = vi.fn().mockReturnValue(c)
  }
  return c
}

function buildRequest(scope: 'me' | 'workspace', workspaceId = WS_ID) {
  return new NextRequest(
    `https://cairn.example/api/calendar/ical?token=${TOKEN}&scope=${scope}&workspaceId=${workspaceId}`,
  )
}

describe('GET /api/calendar/ical', () => {
  afterEach(() => {
    vi.clearAllMocks()
    vi.resetModules()
  })

  it('workspaceId がないと 400 を返す', async () => {
    const { GET } = await import('./route')
    const res = await GET(
      new NextRequest(`https://cairn.example/api/calendar/ical?token=${TOKEN}&scope=workspace`),
    )

    expect(res.status).toBe(400)
    expect(await res.text()).toBe('workspaceId is required')
    expect(mockDb.select).not.toHaveBeenCalled()
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
      .mockReturnValueOnce(
        chain([
          { id: 'proj-1', title: '全体予定', startDate: '2026-06-01', endDate: '2026-06-02' },
        ]),
      )
      .mockReturnValueOnce(chain([]))

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
      .mockReturnValueOnce(
        chain([{ id: 'proj-2', title: '自分の予定', startDate: '2026-06-03', endDate: null }]),
      )
      .mockReturnValueOnce(
        chain([
          {
            id: 'milestone-me',
            projectId: 'proj-2',
            projectTitle: '自分の予定',
            title: '確認会',
            description: null,
            startDate: '2026-06-03',
            endDate: null,
            startTime: null,
            endTime: null,
          },
        ]),
      )

    const { GET } = await import('./route')
    const res = await GET(buildRequest('me'))
    const body = await res.text()

    expect(res.status).toBe(200)
    expect(body).toContain('X-WR-CALNAME:Cairn（自分）')
    expect(body).toContain('SUMMARY:自分の予定')
    expect(body).toContain('SUMMARY:自分の予定 / 確認会')
  })

  it('マイルストーンを終日予定として出力する', async () => {
    mockDb.select
      .mockReturnValueOnce(chain([{ id: USER_ID }]))
      .mockReturnValueOnce(chain([{ workspaceId: WS_ID, role: 'admin' }]))
      .mockReturnValueOnce(chain([]))
      .mockReturnValueOnce(
        chain([
          {
            id: 'milestone-1',
            projectId: 'proj-1',
            projectTitle: '新機能',
            title: 'ベータ公開',
            description: '社内向けに公開',
            startDate: null,
            endDate: '2026-06-10',
            startTime: null,
            endTime: null,
          },
        ]),
      )

    const { GET } = await import('./route')
    const res = await GET(buildRequest('workspace'))
    const body = await res.text()

    expect(res.status).toBe(200)
    expect(body).toContain('UID:milestone-milestone-1@cairn')
    expect(body).toContain('DTSTART;VALUE=DATE:20260610')
    expect(body).toContain('DTEND;VALUE=DATE:20260611')
    expect(body).toContain('SUMMARY:新機能 / ベータ公開')
    expect(body).toContain('DESCRIPTION:社内向けに公開\\nhttps://cairn.example/projects/proj-1')
  })

  it('時刻付きマイルストーンを Asia/Tokyo の時刻として出力する', async () => {
    mockDb.select
      .mockReturnValueOnce(chain([{ id: USER_ID }]))
      .mockReturnValueOnce(chain([{ workspaceId: WS_ID, role: 'admin' }]))
      .mockReturnValueOnce(chain([]))
      .mockReturnValueOnce(
        chain([
          {
            id: 'milestone-2',
            projectId: 'proj-1',
            projectTitle: '新機能',
            title: 'リリース判定',
            description: null,
            startDate: '2026-06-10',
            endDate: '2026-06-10',
            startTime: '10:00',
            endTime: '11:30',
          },
        ]),
      )

    const { GET } = await import('./route')
    const res = await GET(buildRequest('workspace'))
    const body = await res.text()

    expect(res.status).toBe(200)
    expect(body).toContain('DTSTART:20260610T010000Z')
    expect(body).toContain('DTEND:20260610T023000Z')
    expect(body).toContain('SUMMARY:新機能 / リリース判定')
  })

  it('終了時刻だけのマイルストーンを終了日の時刻付き予定として出力する', async () => {
    mockDb.select
      .mockReturnValueOnce(chain([{ id: USER_ID }]))
      .mockReturnValueOnce(chain([{ workspaceId: WS_ID, role: 'admin' }]))
      .mockReturnValueOnce(chain([]))
      .mockReturnValueOnce(
        chain([
          {
            id: 'milestone-end-time',
            projectId: 'proj-1',
            projectTitle: '新機能',
            title: '提出期限',
            description: null,
            startDate: '2026-06-09',
            endDate: '2026-06-10',
            startTime: null,
            endTime: '17:00',
          },
        ]),
      )

    const { GET } = await import('./route')
    const res = await GET(buildRequest('workspace'))
    const body = await res.text()

    expect(res.status).toBe(200)
    expect(body).toContain('DTSTART:20260610T080000Z')
    expect(body).not.toContain('DTSTART;VALUE=DATE:20260609')
  })

  it.each([
    {
      label: '終了時刻が開始時刻より前',
      startTime: '22:00',
      endTime: '02:00',
      expectedStart: 'DTSTART:20260610T130000Z',
      expectedEnd: 'DTEND:20260610T170000Z',
    },
    {
      label: '開始時刻と終了時刻が同じ',
      startTime: '10:00',
      endTime: '10:00',
      expectedStart: 'DTSTART:20260610T010000Z',
      expectedEnd: 'DTEND:20260611T010000Z',
    },
  ])(
    '$labelなら終了時刻を翌日として出力する',
    async ({ startTime, endTime, expectedStart, expectedEnd }) => {
      mockDb.select
        .mockReturnValueOnce(chain([{ id: USER_ID }]))
        .mockReturnValueOnce(chain([{ workspaceId: WS_ID, role: 'admin' }]))
        .mockReturnValueOnce(chain([]))
        .mockReturnValueOnce(
          chain([
            {
              id: 'milestone-overnight',
              projectId: 'proj-1',
              projectTitle: '新機能',
              title: '夜間作業',
              description: null,
              startDate: '2026-06-10',
              endDate: '2026-06-10',
              startTime,
              endTime,
            },
          ]),
        )

      const { GET } = await import('./route')
      const res = await GET(buildRequest('workspace'))
      const body = await res.text()

      expect(res.status).toBe(200)
      expect(body).toContain(expectedStart)
      expect(body).toContain(expectedEnd)
    },
  )

  it('日本語と絵文字をUTF-8で75オクテット以内に折り返す', async () => {
    const projectTitle = `長いプロジェクト名${'計画'.repeat(15)}🚀`
    const milestoneTitle = `長いマイルストーン名${'確認'.repeat(15)}🎉`
    const description = `${'説明'.repeat(30)}✅`
    mockDb.select
      .mockReturnValueOnce(chain([{ id: USER_ID }]))
      .mockReturnValueOnce(chain([{ workspaceId: WS_ID, role: 'admin' }]))
      .mockReturnValueOnce(
        chain([
          {
            id: 'proj-long',
            title: `${projectTitle} / ${milestoneTitle}`,
            startDate: '2026-06-10',
            endDate: null,
          },
        ]),
      )
      .mockReturnValueOnce(
        chain([
          {
            id: 'milestone-long',
            projectId: 'proj-long',
            projectTitle,
            title: milestoneTitle,
            description,
            startDate: '2026-06-10',
            endDate: null,
            startTime: null,
            endTime: null,
          },
        ]),
      )

    const { GET } = await import('./route')
    const res = await GET(buildRequest('workspace'))
    const body = await res.text()
    const unfolded = body.replace(/\r\n /g, '')
    const encoder = new TextEncoder()

    expect(res.status).toBe(200)
    expect(unfolded).toContain(`SUMMARY:${projectTitle} / ${milestoneTitle}`)
    expect(unfolded).toContain(
      `DESCRIPTION:${description}\\nhttps://cairn.example/projects/proj-long`,
    )
    for (const line of body.split('\r\n')) {
      expect(encoder.encode(line).length).toBeLessThanOrEqual(75)
    }
  })

  it('workspaceId で membership を絞り込む', async () => {
    mockDb.select.mockReturnValueOnce(chain([{ id: USER_ID }])).mockReturnValueOnce(chain([]))

    const { GET } = await import('./route')
    const res = await GET(buildRequest('workspace', 'ws-other'))

    expect(res.status).toBe(404)
    expect(await res.text()).toBe('No workspace found')
    expect(mockDb.select).toHaveBeenCalledTimes(2)
  })
})
