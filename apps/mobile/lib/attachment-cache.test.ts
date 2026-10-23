import { beforeEach, describe, expect, test, vi } from 'vitest'

const calls: string[] = []
let resolveDelete: (() => void) | undefined

vi.mock('expo-sharing', () => ({}))
vi.mock('expo-file-system/legacy', () => ({
  cacheDirectory: 'file:///cache/',
  getInfoAsync: vi.fn(async () => ({ exists: false })),
  deleteAsync: vi.fn((path: string) => {
    calls.push(`delete:${path}`)
    // 保存先の削除だけを遅らせ、再試行の取得と重なる状況を作る
    if (!path.endsWith('.download') && resolveDelete === undefined) {
      return new Promise<void>((resolve) => {
        resolveDelete = () => {
          calls.push(`deleted:${path}`)
          resolve()
        }
      })
    }
    return Promise.resolve()
  }),
  downloadAsync: vi.fn(async (_url: string, path: string) => {
    calls.push(`download:${path}`)
    return { status: 200 }
  }),
  moveAsync: vi.fn(async ({ to }: { to: string }) => {
    calls.push(`move:${to}`)
  }),
}))

const { ensureCachedAttachment, removeCachedAttachment } = await import('./attachment-cache')

describe('attachment-cache', () => {
  beforeEach(() => {
    calls.length = 0
    resolveDelete = undefined
  })

  test('キャッシュの削除中に再試行しても、削除が終わってから取り直したファイルを保存先へ移す', async () => {
    const removal = removeCachedAttachment('file-1', 'a.pdf')
    const download = ensureCachedAttachment('https://example.com/a.pdf', 'file-1', 'a.pdf', 'token', undefined, {
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
})
