import { MAX_MESSAGE_ATTACHMENTS } from '@cairn/shared'
import { ALLOWED_DOCUMENT_TYPES } from './attachment-file'

// 他アプリからの共有の受け取り（Android のみ）。判定と直列化をここへ集め、ネイティブとの接続は hooks/use-share-receive.ts に置く

/** expo-sharing が共有のときに開く URL のホスト。scheme はビルドごとにネイティブへ焼き込まれる */
const SHARE_RECEIVE_HOST = 'expo-sharing'
export const SHARE_RECEIVE_PATH = '/share'

// apps/web/src/lib/attachments.ts の MAX_FILE_SIZE と同じ。プランごとの上限はサーバーが判定する
export const MAX_SHARE_FILE_SIZE = 50 * 1024 * 1024

// サーバーが受け付ける形式（apps/web/src/lib/attachments.ts の ALLOWED_MIME_TYPES）に揃える。.ppt は送っても拒否される
export const ALLOWED_SHARE_MIME_TYPES: ReadonlySet<string> = new Set([
  'image/jpeg',
  'image/png',
  'image/gif',
  'image/webp',
  ...ALLOWED_DOCUMENT_TYPES.filter((type) => type !== 'application/vnd.ms-powerpoint'),
])

const GENERIC_MIME_TYPES = new Set(['', 'application/octet-stream'])
const CSV_AMBIGUOUS_MIME_TYPES = new Set(['application/vnd.ms-excel', 'application/octet-stream', ''])

const EXTENSION_TO_MIME: Record<string, string> = {
  jpg: 'image/jpeg',
  jpeg: 'image/jpeg',
  png: 'image/png',
  gif: 'image/gif',
  webp: 'image/webp',
  pdf: 'application/pdf',
  doc: 'application/msword',
  docx: 'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
  xls: 'application/vnd.ms-excel',
  xlsx: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
  pptx: 'application/vnd.openxmlformats-officedocument.presentationml.presentation',
  txt: 'text/plain',
  md: 'text/markdown',
  markdown: 'text/markdown',
  csv: 'text/csv',
}

export interface IncomingSharePayload {
  value: string
  shareType: string
  mimeType?: string | undefined
}

export interface IncomingResolvedPayload extends IncomingSharePayload {
  contentUri: string | null
  contentMimeType: string | null
  originalName: string | null
  contentSize: number | null
}

export type ShareRejectReason = 'unsupported-type' | 'too-large' | 'too-many' | 'unreadable'

export interface ShareFile {
  id: string
  uri: string
  fileName: string
  mimeType: string
  fileSize: number
}

export interface ShareRejectedFile {
  fileName: string
  reason: ShareRejectReason
}

export interface ReceivedShare {
  id: string
  text: string
  files: ShareFile[]
  rejected: ShareRejectedFile[]
}

export type ShareFailure = 'empty' | 'read-failed'

export type ShareInboxState =
  | { status: 'loading' }
  | { status: 'idle' }
  | { status: 'receiving' }
  | { status: 'ready'; share: ReceivedShare }
  | { status: 'failed'; failure: ShareFailure }

export function isShareReceiveUrl(url: string | null | undefined): boolean {
  if (!url) return false
  return /^[a-z][a-z0-9+.-]*:\/\/([^/?#]*)/i.exec(url)?.[1]?.toLowerCase() === SHARE_RECEIVE_HOST
}

/** 共有の URL だけを受け取り画面へ向ける。OAuth のコールバックや開発ビルドの URL はそのまま返す */
export function redirectShareSystemPath(path: string, platform: string): string {
  return platform === 'android' && isShareReceiveUrl(path) ? SHARE_RECEIVE_PATH : path
}

// Android の text/* はファイルでも shareType が text になるため、中身が本文かどうかは値で見分ける
export function isSharedFilePayload(payload: IncomingSharePayload): boolean {
  return /^(content|file):/i.test(payload.value)
}

export function sharedTextFrom(payloads: readonly IncomingSharePayload[]): string {
  return payloads
    .filter((payload) => !isSharedFilePayload(payload))
    .map((payload) => payload.value.trim())
    .filter(Boolean)
    .join('\n')
}

/** apps/web/src/lib/attachments.ts の normalizeMimeType と同じ補完。送信後にサーバーでも同じ正規化が走る */
export function normalizeShareMimeType(fileName: string, mimeType: string | null | undefined): string {
  const type = (mimeType ?? '').split(';')[0]?.trim().toLowerCase() ?? ''
  if (/\.csv$/i.test(fileName) && CSV_AMBIGUOUS_MIME_TYPES.has(type)) return 'text/csv'
  if (ALLOWED_SHARE_MIME_TYPES.has(type)) return type
  const extension = fileName.includes('.') ? (fileName.split('.').pop()?.toLowerCase() ?? '') : ''
  return GENERIC_MIME_TYPES.has(type) ? (EXTENSION_TO_MIME[extension] ?? type) : type
}

/** 受け付ける形式・大きさか判定する。null なら受け付ける */
export function shareRejectReason(input: { mimeType: string; size: number | null }): ShareRejectReason | null {
  if (!ALLOWED_SHARE_MIME_TYPES.has(input.mimeType)) return 'unsupported-type'
  if (input.size === null || input.size <= 0) return 'unreadable'
  return input.size > MAX_SHARE_FILE_SIZE ? 'too-large' : null
}

// java.io.File#toURI は file:/data/... を返し、expo-file-system は file:/// を前提にする
export function normalizeFileUri(uri: string): string {
  return uri.replace(/^file:\/(?!\/)/i, 'file:///')
}

export function serializeReceivedShare(share: ReceivedShare): string {
  return JSON.stringify(share)
}

function isShareFile(value: unknown): value is ShareFile {
  if (typeof value !== 'object' || value === null) return false
  const file = value as Partial<ShareFile>
  return (
    typeof file.id === 'string' &&
    typeof file.uri === 'string' &&
    typeof file.fileName === 'string' &&
    typeof file.mimeType === 'string' &&
    typeof file.fileSize === 'number'
  )
}

function isRejectedFile(value: unknown): value is ShareRejectedFile {
  if (typeof value !== 'object' || value === null) return false
  return typeof (value as Partial<ShareRejectedFile>).fileName === 'string'
}

export function parseStoredShare(raw: string | null): ReceivedShare | null {
  if (!raw) return null
  try {
    const parsed = JSON.parse(raw) as Partial<ReceivedShare> | null
    if (typeof parsed?.id !== 'string' || typeof parsed.text !== 'string') return null
    if (!Array.isArray(parsed.files) || !Array.isArray(parsed.rejected)) return null
    if (!parsed.files.every(isShareFile) || !parsed.rejected.every(isRejectedFile)) return null
    return { id: parsed.id, text: parsed.text, files: parsed.files, rejected: parsed.rejected }
  } catch {
    return null
  }
}

export interface ShareInboxDeps {
  getPayloads: () => IncomingSharePayload[]
  resolvePayloads: () => Promise<IncomingResolvedPayload[]>
  clearPayloads: () => void
  /** ファイルの実際の大きさ。読めなければ null */
  fileSize: (uri: string) => number | null
  /** 受信箱へ移し、移動先の URI を返す。失敗は throw */
  storeFile: (uri: string, id: string) => string
  /** 受信箱のファイルをすべて消す */
  clearStoredFiles: () => void
  /** expo-sharing がキャッシュへコピーした一時ファイルを消す */
  clearIncomingCache: () => void
  load: () => Promise<string | null>
  save: (value: string | null) => Promise<void>
  createId: () => string
  onError: (message: string, error: unknown) => void
}

/**
 * 受け取った共有を端末へ退避し、送信されるまで預かる。Android の Intent はプロセス終了で消えるため、
 * ログイン待ちや送信前に終了しても再開できるよう受信箱へ移す。残すのは最後に受け取った 1 件だけ
 */
export function createShareInbox(deps: ShareInboxDeps, initial: ShareInboxState = { status: 'loading' }) {
  let state = initial
  let navigationPending = false
  let tail: Promise<void> = Promise.resolve()
  const listeners = new Set<() => void>()

  const setState = (next: ShareInboxState, navigate: boolean) => {
    state = next
    navigationPending = navigate
    listeners.forEach((listener) => listener())
  }

  // 受け取り・復元・破棄が重なると一時ファイルと保存内容が食い違うため、1 本の列で順に実行する
  const enqueue = (task: () => Promise<void>): Promise<void> => {
    const run = tail.then(task)
    tail = run.catch(() => undefined)
    return run
  }

  // 失敗はログだけで終えず、受け取り画面のエラーとして見せる
  const fail = (failure: ShareFailure, error: unknown) => {
    deps.onError('共有を受け取れませんでした', error)
    setState({ status: 'failed', failure }, true)
  }

  const removeStored = () => {
    try {
      deps.clearStoredFiles()
    } catch (error) {
      deps.onError('受信箱のファイルを消せませんでした', error)
    }
  }

  const clearIncoming = () => {
    try {
      deps.clearIncomingCache()
    } catch (error) {
      deps.onError('共有の一時ファイルを消せませんでした', error)
    }
  }

  const storeResolved = (resolved: readonly IncomingResolvedPayload[]) => {
    const files: ShareFile[] = []
    const rejected: ShareRejectedFile[] = []
    for (const payload of resolved) {
      const fileName = payload.originalName ?? ''
      const uri = payload.contentUri ? normalizeFileUri(payload.contentUri) : null
      const mimeType = normalizeShareMimeType(fileName, payload.contentMimeType ?? payload.mimeType)
      const size = uri ? deps.fileSize(uri) : null
      const reason = uri ? shareRejectReason({ mimeType, size }) : 'unreadable'
      if (reason || !uri || size === null) {
        rejected.push({ fileName, reason: reason ?? 'unreadable' })
        continue
      }
      // 添付の上限を超えた分も黙って落とさず、送れなかった理由を見せる
      if (files.length >= MAX_MESSAGE_ATTACHMENTS) {
        rejected.push({ fileName, reason: 'too-many' })
        continue
      }
      try {
        const id = deps.createId()
        files.push({ id, uri: deps.storeFile(uri, id), fileName, mimeType, fileSize: size })
      } catch (error) {
        deps.onError('共有されたファイルを保存できませんでした', error)
        rejected.push({ fileName, reason: 'unreadable' })
      }
    }
    return { files, rejected }
  }

  const receive = async (payloads: readonly IncomingSharePayload[]) => {
    setState({ status: 'receiving' }, false)
    try {
      removeStored()
      // URL の共有で resolve するとネイティブが URL を取得しに行くため、ファイルがあるときだけ呼ぶ
      const resolved = payloads.some(isSharedFilePayload) ? await deps.resolvePayloads() : []
      const fileResults = resolved.filter(isSharedFilePayload)
      const { files, rejected } = storeResolved(fileResults)
      const text = sharedTextFrom(payloads)
      if (!text && files.length === 0 && rejected.length === 0) {
        await deps.save(null)
        setState({ status: 'failed', failure: 'empty' }, true)
        return
      }
      const share: ReceivedShare = { id: deps.createId(), text, files, rejected }
      await deps.save(serializeReceivedShare(share))
      setState({ status: 'ready', share }, true)
    } catch (error) {
      removeStored()
      fail('read-failed', error)
    } finally {
      clearIncoming()
      deps.clearPayloads()
    }
  }

  return {
    peek: () => state,
    subscribe: (listener: () => void) => {
      listeners.add(listener)
      return () => {
        listeners.delete(listener)
      }
    },
    /** 画面へ移る必要があるかを 1 度だけ返す。未ログインの間は呼ばず、ログイン後に再開する */
    takeNavigation: () => {
      const pending = navigationPending
      navigationPending = false
      return pending
    },
    hasPendingNavigation: () => navigationPending,

    /** 前回の起動で送らなかった共有を読み戻す */
    restore: () =>
      enqueue(async () => {
        try {
          const share = parseStoredShare(await deps.load())
          if (!share) {
            setState({ status: 'idle' }, false)
            return
          }
          const missing = share.files.filter((file) => deps.fileSize(file.uri) === null)
          setState(
            {
              status: 'ready',
              share: {
                ...share,
                files: share.files.filter((file) => !missing.includes(file)),
                rejected: [
                  ...share.rejected,
                  ...missing.map((file) => ({ fileName: file.fileName, reason: 'unreadable' as const })),
                ],
              },
            },
            true,
          )
        } catch (error) {
          fail('read-failed', error)
        }
      }),

    /** expectShare は共有の URL で起動したとき。何も受け取れなかったことをエラーとして見せる */
    intake: (options: { expectShare: boolean }) =>
      enqueue(async () => {
        let payloads: IncomingSharePayload[]
        try {
          payloads = deps.getPayloads()
        } catch (error) {
          deps.clearPayloads()
          fail('read-failed', error)
          return
        }
        if (payloads.length > 0) {
          await receive(payloads)
          return
        }
        // 前面復帰の取得が先に受け取り終えた後で URL が届くこともあるので、預かり中なら空とは扱わない
        if (options.expectShare && state.status !== 'ready') {
          setState({ status: 'failed', failure: 'empty' }, true)
        }
      }),

    /** 送信後・取り消し・サインアウトで呼ぶ */
    discard: () =>
      enqueue(async () => {
        removeStored()
        setState({ status: 'idle' }, false)
        await deps.save(null)
      }),
  }
}

export type ShareInbox = ReturnType<typeof createShareInbox>

export type ShareTargetKind = 'project' | 'workspace' | 'dm'

export interface ShareTarget {
  id: string
  title: string
  subtitle: string | null
  kind: ShareTargetKind
  unread: boolean
}

export interface ShareTargetLists {
  projects?:
    | ReadonlyArray<{
        channelId: string
        channelName: string
        projectTitle: string
        milestoneId: string | null
        archived: boolean
        unreadCount: number
      }>
    | undefined
  workspace?:
    | ReadonlyArray<{ id: string; name: string | null; archived?: boolean | undefined; unreadCount: number }>
    | undefined
  dms?: ReadonlyArray<{ id: string; participantName: string; unreadCount: number }> | undefined
}

export function buildShareTargets(lists: ShareTargetLists, untitled: string): ShareTarget[] {
  return [
    ...(lists.dms ?? []).map((dm) => ({
      id: dm.id,
      title: dm.participantName,
      subtitle: null,
      kind: 'dm' as const,
      unread: dm.unreadCount > 0,
    })),
    ...(lists.workspace ?? [])
      .filter((channel) => !channel.archived)
      .map((channel) => ({
        id: channel.id,
        title: channel.name ?? untitled,
        subtitle: null,
        kind: 'workspace' as const,
        unread: channel.unreadCount > 0,
      })),
    ...(lists.projects ?? [])
      .filter((channel) => !channel.archived)
      .map((channel) => ({
        id: channel.channelId,
        title: channel.milestoneId ? channel.channelName : channel.projectTitle,
        subtitle: channel.milestoneId ? channel.projectTitle : null,
        kind: 'project' as const,
        unread: channel.unreadCount > 0,
      })),
  ]
}

/** 直近に共有した宛先、未読のある宛先の順に上へ出す。一覧の API は最終投稿日時を返さない */
export function sortShareTargets(targets: readonly ShareTarget[], recentIds: readonly string[]): ShareTarget[] {
  const rank = (target: ShareTarget) => {
    const recent = recentIds.indexOf(target.id)
    if (recent >= 0) return recent
    return recentIds.length + (target.unread ? 0 : 1)
  }
  return targets
    .map((target, index) => ({ target, index }))
    .sort((a, b) => rank(a.target) - rank(b.target) || a.index - b.index)
    .map(({ target }) => target)
}

export function filterShareTargets(targets: readonly ShareTarget[], query: string): ShareTarget[] {
  const needle = query.trim().toLowerCase()
  if (!needle) return [...targets]
  return targets.filter((target) =>
    [target.title, target.subtitle ?? ''].some((value) => value.toLowerCase().includes(needle)),
  )
}

const MAX_RECENT_SHARE_TARGETS = 10

export function recordRecentShareTarget(recentIds: readonly string[], channelId: string): string[] {
  return [channelId, ...recentIds.filter((id) => id !== channelId)].slice(0, MAX_RECENT_SHARE_TARGETS)
}

export function parseRecentShareTargets(raw: string | null): string[] {
  if (!raw) return []
  try {
    const parsed = JSON.parse(raw) as unknown
    return Array.isArray(parsed) ? parsed.filter((id): id is string => typeof id === 'string') : []
  } catch {
    return []
  }
}
