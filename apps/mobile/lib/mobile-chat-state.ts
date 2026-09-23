const TOPIC_PERMISSION_DENIED = /do not have permissions to read from this Channel topic/i

function errorMessage(error: unknown): string {
  if (typeof error === 'string') return error
  if (!error || typeof error !== 'object' || !('message' in error)) return ''
  const message = (error as { message?: unknown }).message
  return typeof message === 'string' ? message : ''
}

export function isRealtimeUnauthorized(error: unknown): boolean {
  return TOPIC_PERMISSION_DENIED.test(errorMessage(error))
}

export function shouldRetryRealtime(status: string, error?: unknown): boolean {
  // CHANNEL_ERROR はソケット瞬断。supabase-js が再 JOIN するのでアプリでは作り直さない。
  // user トピックの CLOSED / TIMED_OUT だけ作り直す。
  // チャンネルトピックは removeChannel も CLOSED を飛ばすので、この関数を使わない。
  if (isRealtimeUnauthorized(error)) return false
  return status === 'TIMED_OUT' || status === 'CLOSED'
}

export function hasFailedUploads(uploads: ReadonlyArray<{ status: string }>): boolean {
  return uploads.some((upload) => upload.status === 'error')
}

export function findMentionQuery(text: string, cursor: number) {
  const beforeCursor = text.slice(0, cursor)
  const match = /@([^\s@]*)$/.exec(beforeCursor)
  if (!match) return null
  return { start: cursor - match[0].length, end: cursor, query: match[1] ?? '' }
}

export function insertMention(
  text: string,
  range: { start: number; end: number },
  displayName: string,
) {
  const inserted = `@${displayName} `
  return {
    text: `${text.slice(0, range.start)}${inserted}${text.slice(range.end)}`,
    cursor: range.start + inserted.length,
  }
}

export function serializeMentions(text: string, mentionIdsByName: ReadonlyMap<string, string>) {
  return [...mentionIdsByName.entries()]
    .sort(([left], [right]) => right.length - left.length)
    .reduce((result, [displayName, userId]) => {
      const escaped = displayName.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')
      return result.replace(
        new RegExp(`@${escaped}(?=[\\s、。！？]|$)`, 'g'),
        `<@${userId}>`,
      )
    }, text)
}

export function extractMentionIdsByName(text: string) {
  const result = new Map<string, string>()
  for (const match of text.matchAll(/<@([^|>\s]+)\|([^>\n]+)>/g)) {
    const [, userId, displayName] = match
    if (userId && displayName) result.set(displayName, userId)
  }
  return result
}

export function mergeChatMessages<T extends { id: string; createdAt: string }>(
  ...groups: ReadonlyArray<ReadonlyArray<T>>
) {
  const byId = new Map<string, T>()
  for (const group of groups) {
    for (const message of group) byId.set(message.id, message)
  }
  return [...byId.values()].sort((left, right) =>
    left.createdAt.localeCompare(right.createdAt) || left.id.localeCompare(right.id),
  )
}

const INTERNAL_MARKDOWN_PATHS = [
  '/api/attachments',
  '/chats',
  '/files',
  '/members',
  '/projects',
  '/tasks',
] as const

function isSupportedInternalPath(pathname: string) {
  return INTERNAL_MARKDOWN_PATHS.some(
    (prefix) => pathname === prefix || pathname.startsWith(`${prefix}/`),
  )
}

export type MobileMarkdownLink =
  | { kind: 'internal'; path: string }
  | { kind: 'external'; url: string }

export function resolveMobileMarkdownLink(
  rawUrl: string,
  appBaseUrl: string,
): MobileMarkdownLink | null {
  const value = rawUrl.trim()
  if (!value || value.startsWith('//')) return null

  if (value.startsWith('/')) {
    const pathname = value.split(/[?#]/, 1)[0] ?? ''
    return isSupportedInternalPath(pathname) ? { kind: 'internal', path: value } : null
  }

  try {
    const parsed = new URL(value)
    if (parsed.protocol === 'mailto:' || parsed.protocol === 'tel:') {
      return { kind: 'external', url: value }
    }
    if (parsed.protocol !== 'http:' && parsed.protocol !== 'https:') return null

    const appOrigin = new URL(appBaseUrl).origin
    if (parsed.origin === appOrigin && isSupportedInternalPath(parsed.pathname)) {
      return {
        kind: 'internal',
        path: `${parsed.pathname}${parsed.search}${parsed.hash}`,
      }
    }
    return { kind: 'external', url: value }
  } catch {
    return null
  }
}
