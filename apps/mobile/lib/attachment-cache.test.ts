import { beforeEach, describe, expect, test, vi } from 'vitest'

const calls: string[] = []
const downloadHeaders: Record<string, string>[] = []
let resolveDelete: (() => void) | undefined

vi.mock('expo-sharing', () => ({
  isAvailableAsync: vi.fn(async () => true),
  shareAsync: vi.fn(async (uri: string) => calls.push(`share:${uri}`)),
}))
vi.mock('expo-file-system/legacy', () => ({
  cacheDirectory: 'file:///cache/',
  getInfoAsync: vi.fn(async () => ({ exists: false })),
  deleteAsync: vi.fn((path: string) => {
    calls.push(`delete:${path}`)
    // 保存先の削除だけを遅らせ、再試行の取得と重なる状況を作る
    if (!path.endsWith('.download') && !path.includes('/original-') && resolveDelete === undefined) {
      return new Promise<void>((resolve) => {
        resolveDelete = () => {
          calls.push(`deleted:${path}`)
          resolve()
        }
      })
    }
    return Promise.resolve()
  }),
  downloadAsync: vi.fn(async (_url: string, path: string, options?: { headers?: Record<string, string> }) => {
    calls.push(`download:${path}`)
    downloadHeaders.push(options?.headers ?? {})
    return { status: 200, uri: path }
  }),
  moveAsync: vi.fn(async ({ to }: { to: string }) => {
    calls.push(`move:${to}`)
  }),
}))

const { ensureCachedAttachment, removeCachedAttachment, shareOriginalPdf } = await import('./attachment-cache')

const auth = { accessToken: 'token', workspaceId: 'workspace-2' }

describe('attachment-cache', () => {
  beforeEach(() => {
    calls.length = 0
    downloadHeaders.length = 0
    resolveDelete = undefined
  })

  test('キャッシュの削除中に再試行しても、削除が終わってから取り直したファイルを保存先へ移す', async () => {
    const removal = removeCachedAttachment('file-1', 'a.pdf')
    const download = ensureCachedAttachment('https://example.com/a.pdf', 'file-1', 'a.pdf', auth, undefined, {
      refresh: true,
    })
    await new Promise((resolve) => setTimeout(resolve, 0))
    expect(calls.some((call) => call.startsWith('download:'))).toBe(false)

    resolveDelete!()
    await removal
    const uri = await download
    const deletedAt = calls.findIndex((call) => call.startsWith('deleted:'))
    const movedAt = calls.findIndex((call) => call.startsWith('move:'))
    expect(deletedAt).toBeGreaterThanOrEqual(0)
    expect(movedAt).toBeGreaterThan(deletedAt)
    expect(uri).toBe(calls[movedAt]!.slice('move:'.length))
  })

  test('原本は毎回別の一時ファイルへ認可付きURLから取得し、共有キャッシュを使わない', async () => {
    await shareOriginalPdf({
      fileUrl: 'https://example.com/a.pdf?original=1',
      fileId: 'file-1',
      fileName: 'a.pdf',
      auth,
    })
    expect(calls.some((call) => call.startsWith('download:file:///cache/original-file-1-'))).toBe(true)
    expect(calls.some((call) => call.includes('/file-1-a.pdf'))).toBe(false)
    expect(calls.some((call) => call.startsWith('share:file:///cache/original-file-1-'))).toBe(true)
    expect(calls.some((call) => call.startsWith('delete:file:///cache/original-file-1-'))).toBe(true)
  })

  test('別のワークスペースの添付も取れるよう、選択中のワークスペースを付けて取得する', async () => {
    // 保存先の削除を遅らせる仕組みはこのテストでは使わない
    resolveDelete = () => undefined
    await ensureCachedAttachment('https://example.com/b.png', 'file-2', 'b.png', auth)
    await shareOriginalPdf({
      fileUrl: 'https://example.com/a.pdf?original=1',
      fileId: 'file-1',
      fileName: 'a.pdf',
      auth,
    })
    expect(downloadHeaders).toEqual([
      { Authorization: 'Bearer token', 'X-Cairn-Workspace-Id': 'workspace-2' },
      { Authorization: 'Bearer token', 'X-Cairn-Workspace-Id': 'workspace-2' },
    ])
  })
})
