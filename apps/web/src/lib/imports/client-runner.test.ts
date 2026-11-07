// Copyright 2026 Cairn Contributors
// SPDX-License-Identifier: Apache-2.0

import { readFileSync } from 'node:fs'
import { join } from 'node:path'
import { describe, expect, test, vi } from 'vitest'
import { parseTeamsExport } from '@cairn/core/import'
import {
  MAX_MEDIA_SIZE,
  chunkMessages,
  collectExportFiles,
  identitiesForConversations,
  relativeExportPath,
  runImport,
  suggestMember,
  toBatchMessage,
  type ImportApi,
} from './client-runner'

const fixture = JSON.parse(readFileSync(join(__dirname, '../../../../../packages/core/src/import/teams/__fixtures__/messages.json'), 'utf8')) as unknown
const COMMUNITY = '19:FixtureCommunityAAAAAAAAAAAAAAAAAAAAAAAAAAA1@thread.v2'
const MEDIA_ID = '0-wus-d1-aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa'

function fakeFile(path: string, size = 10): File & { webkitRelativePath: string } {
  const name = path.split('/').pop()!
  const file = new File([new Uint8Array(Math.min(size, 16))], name)
  Object.defineProperty(file, 'size', { value: size })
  Object.defineProperty(file, 'webkitRelativePath', { value: path })
  return file as File & { webkitRelativePath: string }
}

describe('collectExportFiles', () => {
  test('messages.json と media の画像だけを選び、endpoints.json・invites.json は読まない', () => {
    const collected = collectExportFiles([
      fakeFile('export/messages.json'),
      fakeFile('export/endpoints.json'),
      fakeFile('export/invites.json'),
      fakeFile(`export/media/${MEDIA_ID}.1.jpeg`),
    ])
    expect(collected.messagesFile?.name).toBe('messages.json')
    expect([...collected.media.keys()]).toEqual([MEDIA_ID])
    expect(collected.media.get(MEDIA_ID)?.mimeType).toBe('image/jpeg')
    expect(collected.ignoredFiles).toBe(2)
  })

  test('動画と 50MiB を超える画像は取り込まず、理由を残す', () => {
    const collected = collectExportFiles([
      fakeFile('export/media/0-wus-d1-video.1.mp4'),
      fakeFile('export/media/0-wus-d1-big.1.png', MAX_MEDIA_SIZE + 1),
    ])
    expect(collected.media.size).toBe(0)
    expect(collected.rejectedMedia.get('0-wus-d1-video')).toBe('unsupported-type')
    expect(collected.rejectedMedia.get('0-wus-d1-big')).toBe('too-large')
  })

  test('想定外の場所・名前のファイルは無視する', () => {
    const collected = collectExportFiles([
      fakeFile('export/other/messages.json'),
      fakeFile('export/media/sub/0-wus-d1-x.1.png'),
      fakeFile('export/media/evil name.png'),
    ])
    expect(collected.messagesFile).toBeNull()
    expect(collected.media.size).toBe(0)
    expect(collected.ignoredFiles).toBe(3)
  })

  test('.. を含むパスは扱わない', () => {
    expect(relativeExportPath({ name: 'x', webkitRelativePath: 'export/../messages.json' })).toBeNull()
    expect(relativeExportPath({ name: 'messages.json', webkitRelativePath: '' })).toBe('messages.json')
  })
})

describe('投稿者の対応づけ候補', () => {
  const bundle = parseTeamsExport(fixture)

  test('選んだ会話に出てくる投稿者だけを件数付きで返す', () => {
    const rows = identitiesForConversations(bundle, [COMMUNITY])
    const anonymous = rows.find(row => row.identity.anonymous)
    expect(anonymous?.messages).toBe(2)
    expect(rows.find(row => row.identity.key === 'name:Hanako Sato')?.messages).toBe(1)
  })

  test('表示名が一意に一致するメンバーだけを候補にし、投稿者不明は候補にしない', () => {
    const named = bundle.identities.find(i => i.key === 'name:Hanako Sato')!
    const anonymous = bundle.identities.find(i => i.anonymous)!
    const members = [{ userId: 'u1', displayName: 'hanako　sato' }, { userId: 'u2', displayName: '別の人' }]
    expect(suggestMember(named, members)?.userId).toBe('u1')
    expect(suggestMember(anonymous, members)).toBeNull()
    expect(suggestMember(named, [...members, { userId: 'u3', displayName: 'Hanako Sato' }])).toBeNull()
  })
})

describe('chunkMessages', () => {
  test('件数とバイト数の上限でバッチを分ける', () => {
    const bundle = parseTeamsExport(fixture)
    const messages = bundle.messagesByConversation[COMMUNITY]!.map(m => toBatchMessage(m, new Set()))
    expect(chunkMessages(messages, 10_000_000, 2).map(c => c.length)).toEqual([2, 2, 1])
    expect(chunkMessages(messages, 10, 200).every(c => c.length === 1)).toBe(true)
  })

  test('取り込めない画像の参照はバッチに含めない', () => {
    const bundle = parseTeamsExport(fixture)
    const message = bundle.messagesByConversation[COMMUNITY]!.find(m => m.media.length > 0)!
    expect(toBatchMessage(message, new Set()).mediaObjectIds).toEqual([])
    expect(toBatchMessage(message, new Set([MEDIA_ID])).mediaObjectIds).toEqual([MEDIA_ID])
  })
})

function fakeApi(overrides: Partial<ImportApi> = {}) {
  const api: ImportApi & Record<string, ReturnType<typeof vi.fn>> = {
    createJob: vi.fn(async () => ({ jobId: 'job-1' })),
    lookupMedia: vi.fn(async () => ({})),
    uploadMedia: vi.fn(async () => ({ fileId: 'file-1' })),
    registerMedia: vi.fn(async () => ({ fileId: 'file-1' })),
    importBatch: vi.fn(async (_jobId: string, body: { messages: unknown[] }) => ({ imported: body.messages.length, duplicates: 0, missingMedia: 0, attachments: 0, reactions: 0, quotesLinked: 0, quotesUnresolved: 0 })),
    completeJob: vi.fn(async () => ({})),
    ...overrides,
  } as never
  return api
}

describe('runImport', () => {
  const bundle = parseTeamsExport(fixture)
  const collected = collectExportFiles([fakeFile(`export/media/${MEDIA_ID}.1.jpeg`)])
  const plan = [{ externalId: COMMUNITY, channelId: 'channel-1' }]

  test('複数のメッセージが参照する同じ画像は1回だけアップロードする', async () => {
    const api = fakeApi()
    const result = await runImport({ api, bundle, plan, links: [], collected })
    expect(result.status).toBe('completed')
    expect(api.uploadMedia).toHaveBeenCalledTimes(1)
    expect(api.registerMedia).toHaveBeenCalledWith('job-1', { objectId: MEDIA_ID, fileId: 'file-1', channelId: 'channel-1' })
    expect(result.imported).toBe(5)
  })

  test('同じ画像でも取り込み先チャンネルが違えば、チャンネルごとにアップロードする', async () => {
    const twoChannels = parseTeamsExport(fixture)
    const otherId = '19:FixtureOtherCommunityBBBBBBBBBBBBBBBBBBBBBB1@thread.v2'
    twoChannels.messagesByConversation[otherId] = twoChannels.messagesByConversation[COMMUNITY]!
    const api = fakeApi()
    await runImport({ api, bundle: twoChannels, plan: [...plan, { externalId: otherId, channelId: 'channel-2' }], links: [], collected })
    expect(api.uploadMedia).toHaveBeenCalledTimes(2)
    expect((api.uploadMedia as ReturnType<typeof vi.fn>).mock.calls.map(c => c[0])).toEqual(['channel-1', 'channel-2'])
    expect(api.lookupMedia).toHaveBeenCalledWith('job-1', 'channel-2', [MEDIA_ID])
  })

  test('再実行ではアップロード済みの画像を使い回し、もう一度アップロードしない', async () => {
    const api = fakeApi({ lookupMedia: vi.fn(async () => ({ [MEDIA_ID]: 'file-old' })) })
    await runImport({ api, bundle, plan, links: [], collected })
    expect(api.uploadMedia).not.toHaveBeenCalled()
    const batch = (api.importBatch as ReturnType<typeof vi.fn>).mock.calls[0]![1] as { messages: Array<{ mediaObjectIds: string[] }> }
    expect(batch.messages.some(m => m.mediaObjectIds.includes(MEDIA_ID))).toBe(true)
  })

  test('エクスポートに無い画像は失敗として記録し、メッセージは取り込む', async () => {
    const api = fakeApi()
    const result = await runImport({ api, bundle, plan, links: [], collected: { media: new Map(), rejectedMedia: new Map() } })
    expect(result.mediaFailures).toEqual([{ objectId: MEDIA_ID, reason: 'missing-file' }])
    expect(result.imported).toBe(5)
  })

  test('バッチが失敗したら止めて、失敗としてジョブを終える', async () => {
    const api = fakeApi({ importBatch: vi.fn(async () => { throw new Error('サーバーエラー') }) })
    const result = await runImport({ api, bundle, plan, links: [], collected })
    expect(result.status).toBe('failed')
    expect(result.error).toBe('サーバーエラー')
    expect(api.completeJob).toHaveBeenCalledWith('job-1', expect.objectContaining({ status: 'failed' }))
  })

  test('中止するとそれ以降のバッチを送らず、中止としてジョブを終える', async () => {
    const controller = new AbortController()
    controller.abort()
    const api = fakeApi()
    const result = await runImport({ api, bundle, plan, links: [], collected, signal: controller.signal })
    expect(result.status).toBe('cancelled')
    expect(api.importBatch).not.toHaveBeenCalled()
  })

  test('ジョブには選んだ会話の投稿者と管理者が確認した紐づけだけを送る', async () => {
    const api = fakeApi()
    await runImport({ api, bundle, plan, links: [{ key: 'name:Hanako Sato', userId: 'user-9' }], collected })
    const body = (api.createJob as ReturnType<typeof vi.fn>).mock.calls[0]![0] as { identities: Array<{ key: string }>; links: unknown[] }
    expect(body.identities.map(i => i.key)).toContain('anonymous')
    expect(body.links).toEqual([{ key: 'name:Hanako Sato', userId: 'user-9' }])
  })

  test('結果レポートは件数と理由だけで、本文・氏名を含まない', async () => {
    const api = fakeApi()
    await runImport({ api, bundle, plan, links: [], collected: { media: new Map(), rejectedMedia: new Map() } })
    const body = JSON.stringify((api.completeJob as ReturnType<typeof vi.fn>).mock.calls[0]![1])
    expect(body).not.toContain('山田')
    expect(body).not.toContain('Hanako')
    expect(body).not.toContain('写真')
    expect(body).toContain('"deletedSkipped":1')
    expect(body).toContain('"one-on-one":1')
  })
})
