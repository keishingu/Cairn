// Copyright 2026 Cairn Contributors
// SPDX-License-Identifier: Apache-2.0

import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

const DEV_USER_ID = '00000000-0000-0000-0000-000000000001'
const DEV_WORKSPACE_ID = '10000000-0000-0000-0000-000000000001'
const CHANNEL_ID = '20000000-0000-0000-0000-000000000001'

const { mockGetAuthContext, mockRequireChannelAccess } = vi.hoisted(() => ({
  mockGetAuthContext: vi.fn(),
  mockRequireChannelAccess: vi.fn(),
}))

vi.mock('@/lib/get-auth-context', () => ({ getAuthContext: mockGetAuthContext }))
vi.mock('@/lib/permissions', () => ({ requireChannelAccess: mockRequireChannelAccess }))
vi.mock('@/lib/supabase/service', () => ({
  createServiceRoleClient: () => ({
    storage: { from: () => ({ upload: vi.fn() }) },
  }),
}))

describe('/api/attachments/upload のアクセス制御', () => {
  beforeEach(() => {
    mockGetAuthContext.mockResolvedValue({
      ctx: { userId: DEV_USER_ID, workspaceId: DEV_WORKSPACE_ID },
      error: null,
    })
  })

  afterEach(() => {
    vi.clearAllMocks()
  })

  it('アクセス権の無いチャンネルへはアップロードできない', async () => {
    mockRequireChannelAccess.mockResolvedValue(
      new Response(JSON.stringify({ error: 'forbidden' }), { status: 403 }),
    )

    const formData = new FormData()
    formData.set('channelId', CHANNEL_ID)
    formData.set('file', new Blob(['hello'], { type: 'text/plain' }), 'hello.txt')

    const { POST } = await import('./route')
    const res = await POST({ formData: () => Promise.resolve(formData) } as Request)

    expect(res.status).toBe(403)
    expect(mockRequireChannelAccess).toHaveBeenCalledWith(DEV_WORKSPACE_ID, DEV_USER_ID, CHANNEL_ID)
  })

  // ブラウザが file.type を返さない PDF を弾いてしまう不具合の回帰防止。
  // MIME チェックは requireChannelAccess より前に走るため、検証を通過すれば
  // requireChannelAccess に到達する点を利用してアサートする。
  it('file.type が空でも拡張子が .pdf なら形式チェックを通過する', async () => {
    mockRequireChannelAccess.mockResolvedValue(
      new Response(JSON.stringify({ error: 'forbidden' }), { status: 403 }),
    )

    const formData = new FormData()
    formData.set('channelId', CHANNEL_ID)
    // type を空文字にして「ブラウザが MIME を判定できなかった」状況を再現する
    formData.set('file', new Blob(['%PDF-1.4'], { type: '' }), 'document.pdf')

    const { POST } = await import('./route')
    const res = await POST({ formData: () => Promise.resolve(formData) } as Request)

    // 400（対応していない形式）ではなく、チャンネルアクセス検証まで進むこと
    expect(res.status).toBe(403)
    expect(mockRequireChannelAccess).toHaveBeenCalledWith(DEV_WORKSPACE_ID, DEV_USER_ID, CHANNEL_ID)
  })

  it('拡張子からも MIME を解決できないファイルは 400 で弾く', async () => {
    const formData = new FormData()
    formData.set('channelId', CHANNEL_ID)
    formData.set('file', new Blob(['binary'], { type: 'application/octet-stream' }), 'archive.zip')

    const { POST } = await import('./route')
    const res = await POST({ formData: () => Promise.resolve(formData) } as Request)

    expect(res.status).toBe(400)
    // 形式チェックで弾かれるため、チャンネルアクセス検証には到達しない
    expect(mockRequireChannelAccess).not.toHaveBeenCalled()
  })
})
