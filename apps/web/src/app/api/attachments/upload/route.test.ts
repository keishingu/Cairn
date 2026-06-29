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

// jsdom の Blob/File は arrayBuffer を実装していないため、本番（undici）相当の
// 挙動になるよう File へ arrayBuffer を生やしてからフォームデータに詰める。
function appendFile(formData: FormData, content: string, type: string, name: string) {
  formData.set('file', new Blob([content], { type }), name)
  const file = formData.get('file') as File
  const bytes = new TextEncoder().encode(content)
  Object.defineProperty(file, 'arrayBuffer', {
    configurable: true,
    value: async () => bytes.buffer.slice(0, bytes.byteLength),
  })
}

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
    appendFile(formData, 'hello', 'text/plain', 'hello.txt')

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
    appendFile(formData, '%PDF-1.4', '', 'document.pdf')

    const { POST } = await import('./route')
    const res = await POST({ formData: () => Promise.resolve(formData) } as Request)

    // 400（対応していない形式）ではなく、チャンネルアクセス検証まで進むこと
    expect(res.status).toBe(403)
    expect(mockRequireChannelAccess).toHaveBeenCalledWith(DEV_WORKSPACE_ID, DEV_USER_ID, CHANNEL_ID)
  })

  // 拡張子も無く file.type が application/octet-stream の実 PDF を弾く不具合の回帰防止。
  it('拡張子が無くても先頭バイトが %PDF なら形式チェックを通過する', async () => {
    mockRequireChannelAccess.mockResolvedValue(
      new Response(JSON.stringify({ error: 'forbidden' }), { status: 403 }),
    )

    const formData = new FormData()
    formData.set('channelId', CHANNEL_ID)
    // 拡張子なし・汎用 MIME だが中身は PDF（先頭が "%PDF"）
    appendFile(formData, '%PDF-1.7\n...', 'application/octet-stream', '三洋物産様向け提案資料_v0_1')

    const { POST } = await import('./route')
    const res = await POST({ formData: () => Promise.resolve(formData) } as Request)

    expect(res.status).toBe(403)
    expect(mockRequireChannelAccess).toHaveBeenCalledWith(DEV_WORKSPACE_ID, DEV_USER_ID, CHANNEL_ID)
  })

  it('拡張子があり形式が分かる非対応ファイルは「対応していない形式」エラーで弾く', async () => {
    const formData = new FormData()
    formData.set('channelId', CHANNEL_ID)
    appendFile(formData, 'binary', 'application/octet-stream', 'archive.zip')

    const { POST } = await import('./route')
    const res = await POST({ formData: () => Promise.resolve(formData) } as Request)

    expect(res.status).toBe(400)
    const body = await res.json() as { error: string }
    expect(body.error).toContain('対応していないファイル形式です')
    // 形式チェックで弾かれるため、チャンネルアクセス検証には到達しない
    expect(mockRequireChannelAccess).not.toHaveBeenCalled()
  })

  it('拡張子も型情報も無く判別できないファイルは拡張子付与を促すエラーで弾く', async () => {
    const formData = new FormData()
    formData.set('channelId', CHANNEL_ID)
    // 拡張子なし・汎用 MIME・中身も既知のマジックナンバーに該当しない
    appendFile(formData, 'not a known signature', 'application/octet-stream', 'mystery_file')

    const { POST } = await import('./route')
    const res = await POST({ formData: () => Promise.resolve(formData) } as Request)

    expect(res.status).toBe(400)
    const body = await res.json() as { error: string }
    expect(body.error).toBe('ファイル形式が不明です。拡張子をつけて再度アップロードしてください')
    expect(mockRequireChannelAccess).not.toHaveBeenCalled()
  })
})
