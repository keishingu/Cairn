import { readFileSync } from 'node:fs'
import { MAX_MESSAGE_ATTACHMENTS } from '@cairn/shared'
import { describe, expect, it, vi } from 'vitest'
import {
  ALLOWED_SHARE_MIME_TYPES,
  buildShareTargets,
  createShareInbox,
  filterShareTargets,
  isShareReceiveUrl,
  isSharedFilePayload,
  MAX_SHARE_FILE_SIZE,
  normalizeFileUri,
  normalizeShareMimeType,
  parseRecentShareTargets,
  parseStoredShare,
  recordRecentShareTarget,
  redirectShareSystemPath,
  serializeReceivedShare,
  sharedTextFrom,
  shareRejectReason,
  sortShareTargets,
  type IncomingResolvedPayload,
  type IncomingSharePayload,
  type ReceivedShare,
  type ShareInboxDeps,
  type ShareTarget,
} from './share-receive'

const webAttachments = readFileSync(new URL('../../web/src/lib/attachments.ts', import.meta.url), 'utf8')

function makeDeps(overrides: Partial<ShareInboxDeps> = {}) {
  let id = 0
  let stored: string | null = null
  const deps = {
    getPayloads: vi.fn((): IncomingSharePayload[] => []),
    resolvePayloads: vi.fn(async (): Promise<IncomingResolvedPayload[]> => []),
    clearPayloads: vi.fn(),
    fileSize: vi.fn((_uri: string): number | null => 100),
    storeFile: vi.fn((_uri: string, fileId: string) => `file:///inbox/${fileId}`),
    clearStoredFiles: vi.fn(),
    clearIncomingCache: vi.fn(),
    load: vi.fn(async () => stored),
    save: vi.fn(async (value: string | null) => {
      stored = value
    }),
    createId: vi.fn(() => `id-${++id}`),
    onError: vi.fn(),
    ...overrides,
  }
  return deps
}

const resolvedFile = (overrides: Partial<IncomingResolvedPayload> = {}): IncomingResolvedPayload => ({
  value: 'content://media/1',
  shareType: 'file',
  mimeType: 'application/pdf',
  contentUri: 'file:/cache/expo-sharing/a/plan.pdf',
  contentMimeType: 'application/pdf',
  originalName: 'plan.pdf',
  contentSize: 100,
  ...overrides,
})

const filePayload: IncomingSharePayload = { value: 'content://media/1', shareType: 'file', mimeType: 'application/pdf' }

describe('共有の URL', () => {
  it('バリアントごとの scheme の共有 URL を受け取り画面へ向ける', () => {
    for (const scheme of ['cairn', 'cairn-dev', 'cairn-preview']) {
      expect(isShareReceiveUrl(`${scheme}://expo-sharing`)).toBe(true)
      expect(redirectShareSystemPath(`${scheme}://expo-sharing`, 'android')).toBe('/share')
    }
  })

  it('OAuth のコールバックと開発ビルドの URL はそのまま通す', () => {
    const urls = [
      'cairn://auth/callback?code=abc',
      'exp+cairn-dev://expo-development-client/?url=http%3A%2F%2F192.168.0.1%3A8081',
      '/chats',
    ]
    for (const url of urls) expect(redirectShareSystemPath(url, 'android')).toBe(url)
  })

  it('ホスト以外に expo-sharing を含むだけの URL は共有として扱わない', () => {
    expect(isShareReceiveUrl('cairn://chats/expo-sharing')).toBe(false)
    expect(isShareReceiveUrl('cairn://expo-sharing-other')).toBe(false)
    expect(isShareReceiveUrl(null)).toBe(false)
  })

  it('iOS では受け取り画面へ向けない', () => {
    expect(redirectShareSystemPath('cairn://expo-sharing', 'ios')).toBe('cairn://expo-sharing')
  })
})

describe('共有の内容の判定', () => {
  it('サーバーが受け付ける MIME と一致する', () => {
    const block = /ALLOWED_MIME_TYPES = new Set\(\[([\s\S]*?)\]\)/.exec(webAttachments)?.[1] ?? ''
    const serverTypes = [...block.matchAll(/'([^']+)'/g)].map((match) => match[1])

    expect([...ALLOWED_SHARE_MIME_TYPES].sort()).toEqual(serverTypes.sort())
  })

  it('サイズ上限がサーバーと一致する', () => {
    expect(webAttachments).toContain(`MAX_FILE_SIZE = ${MAX_SHARE_FILE_SIZE / (1024 * 1024)} * 1024 * 1024`)
  })

  it('text/* でも content URI はファイルとして扱い本文に混ぜない', () => {
    const payloads = [
      { value: 'content://files/memo.txt', shareType: 'text', mimeType: 'text/plain' },
      { value: ' https://example.com ', shareType: 'url', mimeType: 'text/plain' },
    ]

    expect(isSharedFilePayload(payloads[0]!)).toBe(true)
    expect(sharedTextFrom(payloads)).toBe('https://example.com')
  })

  it('汎用 MIME は拡張子から補完し、CSV の揺れを正規化する', () => {
    expect(normalizeShareMimeType('note.md', 'application/octet-stream')).toBe('text/markdown')
    expect(normalizeShareMimeType('list.csv', 'application/vnd.ms-excel')).toBe('text/csv')
    expect(normalizeShareMimeType('a.txt', 'text/plain; charset=utf-8')).toBe('text/plain')
    expect(normalizeShareMimeType('song.mp3', 'audio/mpeg')).toBe('audio/mpeg')
  })

  it('許可外の形式・上限超過・読めないファイルを理由つきで拒否する', () => {
    expect(shareRejectReason({ mimeType: 'audio/mpeg', size: 10 })).toBe('unsupported-type')
    expect(shareRejectReason({ mimeType: 'image/heic', size: 10 })).toBe('unsupported-type')
    expect(shareRejectReason({ mimeType: 'application/pdf', size: MAX_SHARE_FILE_SIZE + 1 })).toBe('too-large')
    expect(shareRejectReason({ mimeType: 'application/pdf', size: 0 })).toBe('unreadable')
    expect(shareRejectReason({ mimeType: 'application/pdf', size: null })).toBe('unreadable')
    expect(shareRejectReason({ mimeType: 'application/pdf', size: MAX_SHARE_FILE_SIZE })).toBeNull()
  })

  it('file:/ の URI を file:/// に揃える', () => {
    expect(normalizeFileUri('file:/data/cache/a.pdf')).toBe('file:///data/cache/a.pdf')
    expect(normalizeFileUri('file:///data/cache/a.pdf')).toBe('file:///data/cache/a.pdf')
  })
})

describe('預かった共有の保存形式', () => {
  const share: ReceivedShare = {
    id: 's1',
    text: 'hello',
    files: [{ id: 'f1', uri: 'file:///inbox/f1', fileName: 'a.pdf', mimeType: 'application/pdf', fileSize: 1 }],
    rejected: [{ fileName: 'b.mp3', reason: 'unsupported-type' }],
  }

  it('保存した内容を読み戻せる', () => {
    expect(parseStoredShare(serializeReceivedShare(share))).toEqual(share)
  })

  it('壊れた保存内容は無視する', () => {
    expect(parseStoredShare(null)).toBeNull()
    expect(parseStoredShare('{broken')).toBeNull()
    expect(parseStoredShare(JSON.stringify({ id: 's1', text: 'a', files: [{ id: 1 }], rejected: [] }))).toBeNull()
  })
})

describe('共有の受信箱', () => {
  it('本文だけの共有ではファイルの解決（URL の取得）を呼ばない', async () => {
    const deps = makeDeps({
      getPayloads: vi.fn(() => [{ value: 'https://example.com', shareType: 'url', mimeType: 'text/plain' }]),
    })
    const inbox = createShareInbox(deps)

    await inbox.intake({ expectShare: true })

    expect(deps.resolvePayloads).not.toHaveBeenCalled()
    expect(inbox.peek()).toMatchObject({ status: 'ready', share: { text: 'https://example.com', files: [] } })
    expect(deps.clearPayloads).toHaveBeenCalled()
  })

  it('ファイルを受信箱へ移して保存する', async () => {
    const deps = makeDeps({
      getPayloads: vi.fn(() => [filePayload]),
      resolvePayloads: vi.fn(async () => [resolvedFile()]),
    })
    const inbox = createShareInbox(deps)

    await inbox.intake({ expectShare: true })

    expect(deps.storeFile).toHaveBeenCalledWith('file:///cache/expo-sharing/a/plan.pdf', 'id-1')
    const state = inbox.peek()
    expect(state).toMatchObject({
      status: 'ready',
      share: { files: [{ uri: 'file:///inbox/id-1', fileName: 'plan.pdf', mimeType: 'application/pdf', fileSize: 100 }] },
    })
    expect(deps.save).toHaveBeenCalledWith(expect.stringContaining('plan.pdf'))
    expect(deps.clearIncomingCache).toHaveBeenCalled()
  })

  it('許可外の形式は捨てずに拒否の理由として残す', async () => {
    const deps = makeDeps({
      getPayloads: vi.fn(() => [filePayload]),
      resolvePayloads: vi.fn(async () => [
        resolvedFile({ originalName: 'song.mp3', contentMimeType: 'audio/mpeg' }),
      ]),
    })
    const inbox = createShareInbox(deps)

    await inbox.intake({ expectShare: true })

    expect(deps.storeFile).not.toHaveBeenCalled()
    expect(inbox.peek()).toMatchObject({
      status: 'ready',
      share: { files: [], rejected: [{ fileName: 'song.mp3', reason: 'unsupported-type' }] },
    })
  })

  it('添付の上限を超えた分は too-many として見せる', async () => {
    const count = MAX_MESSAGE_ATTACHMENTS + 1
    const deps = makeDeps({
      getPayloads: vi.fn(() => [filePayload]),
      resolvePayloads: vi.fn(async () =>
        Array.from({ length: count }, (_, i) => resolvedFile({ originalName: `f${i}.pdf` })),
      ),
    })
    const inbox = createShareInbox(deps)

    await inbox.intake({ expectShare: true })

    const state = inbox.peek()
    if (state.status !== 'ready') throw new Error(`unexpected ${state.status}`)
    expect(state.share.files).toHaveLength(MAX_MESSAGE_ATTACHMENTS)
    expect(state.share.rejected).toEqual([{ fileName: `f${count - 1}.pdf`, reason: 'too-many' }])
  })

  it('移動に失敗したファイルは読み取り失敗として見せる', async () => {
    const deps = makeDeps({
      getPayloads: vi.fn(() => [filePayload]),
      resolvePayloads: vi.fn(async () => [resolvedFile()]),
      storeFile: vi.fn(() => {
        throw new Error('disk full')
      }),
    })
    const inbox = createShareInbox(deps)

    await inbox.intake({ expectShare: true })

    expect(inbox.peek()).toMatchObject({
      status: 'ready',
      share: { rejected: [{ fileName: 'plan.pdf', reason: 'unreadable' }] },
    })
  })

  it('コピーに失敗したら read-failed になり、Intent を消して繰り返さない', async () => {
    const deps = makeDeps({
      getPayloads: vi.fn(() => [filePayload]),
      resolvePayloads: vi.fn(async () => {
        throw new Error('copy failed')
      }),
    })
    const inbox = createShareInbox(deps)

    await inbox.intake({ expectShare: true })

    expect(inbox.peek()).toEqual({ status: 'failed', failure: 'read-failed' })
    expect(deps.clearPayloads).toHaveBeenCalled()
  })

  it('共有の URL で開いたのに空ならエラーにする', async () => {
    const inbox = createShareInbox(makeDeps(), { status: 'idle' })

    await inbox.intake({ expectShare: true })

    expect(inbox.peek()).toEqual({ status: 'failed', failure: 'empty' })
    expect(inbox.takeNavigation()).toBe(true)
  })

  it('通常の起動や前面復帰で空なら何も起こさない', async () => {
    const inbox = createShareInbox(makeDeps(), { status: 'idle' })

    await inbox.intake({ expectShare: false })

    expect(inbox.peek()).toEqual({ status: 'idle' })
    expect(inbox.takeNavigation()).toBe(false)
  })

  it('前面復帰で受け取り済みなら、遅れて届いた URL を空のエラーにしない', async () => {
    const payloads = [{ value: 'hello', shareType: 'text' }]
    const deps = makeDeps({ getPayloads: vi.fn(() => payloads.splice(0)) })
    const inbox = createShareInbox(deps)

    await inbox.intake({ expectShare: false })
    await inbox.intake({ expectShare: true })

    expect(inbox.peek()).toMatchObject({ status: 'ready', share: { text: 'hello' } })
  })

  it('プロセス終了後に保存内容から再開する', async () => {
    const deps = makeDeps()
    const first = createShareInbox({
      ...deps,
      getPayloads: () => [{ value: 'hello', shareType: 'text' }],
    })
    await first.intake({ expectShare: true })

    const second = createShareInbox(deps)
    await second.restore()

    expect(second.peek()).toMatchObject({ status: 'ready', share: { text: 'hello' } })
    expect(second.takeNavigation()).toBe(true)
  })

  it('再開時に消えていたファイルはエラーとして見せる', async () => {
    const share: ReceivedShare = {
      id: 's1',
      text: '',
      files: [{ id: 'f1', uri: 'file:///inbox/f1', fileName: 'a.pdf', mimeType: 'application/pdf', fileSize: 1 }],
      rejected: [],
    }
    const deps = makeDeps({
      load: vi.fn(async () => serializeReceivedShare(share)),
      fileSize: vi.fn(() => null),
    })
    const inbox = createShareInbox(deps)

    await inbox.restore()

    expect(inbox.peek()).toMatchObject({
      status: 'ready',
      share: { files: [], rejected: [{ fileName: 'a.pdf', reason: 'unreadable' }] },
    })
  })

  it('移動の案内は 1 度だけ返す', async () => {
    const inbox = createShareInbox(makeDeps({ getPayloads: vi.fn(() => [{ value: 'a', shareType: 'text' }]) }))
    await inbox.intake({ expectShare: true })

    expect(inbox.takeNavigation()).toBe(true)
    expect(inbox.takeNavigation()).toBe(false)
  })

  it('破棄でファイルと保存内容を消す', async () => {
    const clearStoredFiles = vi.fn()
    const deps = makeDeps({ getPayloads: vi.fn(() => [{ value: 'a', shareType: 'text' }]), clearStoredFiles })
    const inbox = createShareInbox(deps)
    await inbox.intake({ expectShare: true })
    clearStoredFiles.mockClear()

    await inbox.discard()

    expect(clearStoredFiles).toHaveBeenCalled()
    expect(deps.save).toHaveBeenLastCalledWith(null)
    expect(inbox.peek()).toEqual({ status: 'idle' })
    expect(inbox.takeNavigation()).toBe(false)
  })
})

describe('共有の宛先', () => {
  const lists = {
    dms: [{ id: 'dm', participantName: 'Aoi', unreadCount: 0 }],
    workspace: [
      { id: 'general', name: 'general', unreadCount: 2 },
      { id: 'old', name: 'old', archived: true, unreadCount: 0 },
    ],
    projects: [
      { channelId: 'p1', channelName: 'general', projectTitle: 'Summit', milestoneId: null, archived: false, unreadCount: 0 },
      { channelId: 'p2', channelName: 'Week 1', projectTitle: 'Summit', milestoneId: 'm1', archived: false, unreadCount: 0 },
      { channelId: 'p3', channelName: 'x', projectTitle: 'Done', milestoneId: null, archived: true, unreadCount: 0 },
    ],
  }

  it('DM を含め、アーカイブ済みを除いて並べる', () => {
    const targets = buildShareTargets(lists, 'Channels')

    expect(targets.map((target) => target.id)).toEqual(['dm', 'general', 'p1', 'p2'])
    expect(targets.find((target) => target.id === 'p1')?.title).toBe('Summit')
    expect(targets.find((target) => target.id === 'p2')).toMatchObject({ title: 'Week 1', subtitle: 'Summit' })
  })

  it('直近の宛先、未読の順に上へ出す', () => {
    const targets = buildShareTargets(lists, 'Channels')

    expect(sortShareTargets(targets, ['p2']).map((target) => target.id)).toEqual(['p2', 'general', 'dm', 'p1'])
  })

  it('名前とプロジェクト名で検索できる', () => {
    const targets: ShareTarget[] = buildShareTargets(lists, 'Channels')

    expect(filterShareTargets(targets, 'SUMMIT').map((target) => target.id)).toEqual(['p1', 'p2'])
    expect(filterShareTargets(targets, '  ')).toHaveLength(4)
  })

  it('直近の宛先は重複なしで最大 10 件を残す', () => {
    const ids = Array.from({ length: 10 }, (_, i) => `c${i}`)

    expect(recordRecentShareTarget(ids, 'c3')[0]).toBe('c3')
    expect(recordRecentShareTarget(ids, 'new')).toHaveLength(10)
    expect(new Set(recordRecentShareTarget(ids, 'c3')).size).toBe(10)
  })

  it('壊れた履歴は空として読む', () => {
    expect(parseRecentShareTargets('{')).toEqual([])
    expect(parseRecentShareTargets('["a",1]')).toEqual(['a'])
  })
})
