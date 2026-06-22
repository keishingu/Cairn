// Copyright 2026 Cairn Contributors
// SPDX-License-Identifier: Apache-2.0

import { afterEach, describe, expect, it, vi } from 'vitest'

const { mockGetAuthContext, mockDb, mockDownload } = vi.hoisted(() => {
  const mockGetAuthContext = vi.fn().mockResolvedValue({
    ctx: { userId: 'user-1', workspaceId: 'workspace-1' },
    error: null,
  })
  const mockDb = { select: vi.fn() }
  const mockDownload = vi.fn().mockResolvedValue({
    data: '# 見出し',
    error: null,
  })
  return { mockGetAuthContext, mockDb, mockDownload }
})

vi.mock('@/lib/get-auth-context', () => ({
  getAuthContext: mockGetAuthContext,
}))

vi.mock('@/lib/supabase/service', () => ({
  createServiceRoleClient: () => ({
    storage: {
      from: vi.fn(() => ({
        download: mockDownload,
      })),
    },
  }),
}))

vi.mock('@cairn/db', () => ({
  db: mockDb,
  files: {
    id: 'files.id',
    workspaceId: 'files.workspaceId',
    storagePath: 'files.storagePath',
  },
}))

vi.mock('drizzle-orm', () => ({
  eq: vi.fn(() => 'eq'),
}))

function selectChain(result: unknown[]) {
  return {
    from: vi.fn().mockReturnValue({
      where: vi.fn().mockReturnValue({
        limit: vi.fn().mockResolvedValue(result),
      }),
    }),
  }
}

describe('GET /api/attachments/[fileId]', () => {
  afterEach(() => {
    vi.clearAllMocks()
    mockGetAuthContext.mockResolvedValue({
      ctx: { userId: 'user-1', workspaceId: 'workspace-1' },
      error: null,
    })
    mockDownload.mockResolvedValue({
      data: '# 見出し',
      error: null,
    })
  })

  it('Markdownファイルは保存MIMEが汎用でもUTF-8つきtext/markdownで返す', async () => {
    mockDb.select.mockReturnValueOnce(
      selectChain([
        {
          id: 'file-1',
          workspaceId: 'workspace-1',
          storagePath: 'workspace-1/channel-1/file.md',
          fileName: '議事録.md',
          mimeType: 'application/octet-stream',
        },
      ]),
    )

    const { GET } = await import('./route')
    const res = await GET(new Request('http://localhost/api/attachments/file-1'), {
      params: Promise.resolve({ fileId: 'file-1' }),
    })

    expect(res.status).toBe(200)
    expect(res.headers.get('Content-Type')).toBe('text/markdown; charset=utf-8')
    expect(await res.text()).toBe('# 見出し')
  })
})
