// Copyright 2026 Cairn Contributors
// SPDX-License-Identifier: Apache-2.0

import type {
  ImportBundle,
  ImportConversation,
  ImportConversationKind,
  ImportExternalFile,
  ImportIdentity,
  ImportMessage,
  ImportReaction,
  ImportSkippedMessage,
} from '../model'
import { teamsReactionToEmoji } from './emoji'
import { decodeEntities, encodeLinkUrl, escapeMarkdownText, teamsHtmlToText, teamsPlainToText } from './html'

/**
 * Teams（個人用）の「チャット履歴」エクスポートの messages.json を共通モデルに変換する。
 *
 * 前提（docs/research/teams-community-export-analysis.md で確認した形式）:
 * - 投稿者の ID（`from`）はエクスポートした本人の投稿にしか入らない。本人の連絡先の人は表示名だけ、
 *   それ以外は表示名も無い。名前の無い投稿は「投稿者不明」にまとめ、誰かを推定しない
 * - 投稿と返信の親子関係は無い。引用返信（`qtdMsgs`）だけを引用元として扱う
 * - 実データの件数はエクスポートごとに違う。件数や会話の種類を固定値として扱わない
 *
 * endpoints.json・invites.json は読まない（端末の鍵・招待リンクが入っている）。
 */

export const TEAMS_EXPORT_OWNER_LABEL = 'Export Owner'
export const TEAMS_UNKNOWN_USER_LABEL = 'Unknown User'
export const ANONYMOUS_IDENTITY_KEY = 'anonymous'

const MAX_CONVERSATIONS = 5_000
const MAX_TEXT_LENGTH = 40_000

export class TeamsExportFormatError extends Error {
  constructor(message: string) {
    super(message)
    this.name = 'TeamsExportFormatError'
  }
}

export interface ParseTeamsExportOptions {
  /** イベントの日時を本文に書くときのタイムゾーン（IANA 名）。既定は UTC */
  timeZone?: string
}

type Json = Record<string, unknown>

function isObject(value: unknown): value is Json {
  return typeof value === 'object' && value !== null && !Array.isArray(value)
}

function str(value: unknown): string | null {
  return typeof value === 'string' ? value : null
}

function parseJsonString(value: unknown): unknown {
  if (typeof value !== 'string' || value === '') return null
  try {
    return JSON.parse(value)
  } catch {
    return null
  }
}

function epochToIso(value: unknown): string | null {
  const n = typeof value === 'number' ? value : typeof value === 'string' && /^\d+$/.test(value) ? Number(value) : NaN
  if (!Number.isFinite(n) || n <= 0) return null
  const date = new Date(n)
  return Number.isNaN(date.getTime()) ? null : date.toISOString()
}

function isoOrNull(value: unknown): string | null {
  const s = str(value)
  if (!s) return null
  const date = new Date(s)
  return Number.isNaN(date.getTime()) ? null : date.toISOString()
}

export function teamsConversationKind(id: string): ImportConversationKind {
  if (id.startsWith('19:uni01_') || id.includes('@unq.gbl.spaces')) return 'one-on-one'
  if (id.startsWith('19:meeting_')) return 'meeting'
  if (id.startsWith('19:stream01_') || id.startsWith('48:')) return 'other'
  if (/^19:[^@]+@thread\.(v2|skype|tacv2)$/.test(id)) return 'group'
  return 'other'
}

const USER_MESSAGE_TYPES = new Set(['RichText/Html', 'Text', 'RichText', 'RichText/Media_GenericFile'])

function formatEventDate(iso: string, timeZone: string): string {
  const date = new Date(iso)
  if (Number.isNaN(date.getTime())) return iso
  try {
    const parts = new Intl.DateTimeFormat('en-CA', {
      timeZone, year: 'numeric', month: '2-digit', day: '2-digit', hour: '2-digit', minute: '2-digit', hour12: false,
    }).formatToParts(date)
    const get = (type: string) => parts.find(p => p.type === type)?.value ?? ''
    return `${get('year')}-${get('month')}-${get('day')} ${get('hour') === '24' ? '00' : get('hour')}:${get('minute')}`
  } catch {
    return date.toISOString()
  }
}

function eventCardText(meeting: unknown, timeZone: string): string | null {
  if (!isObject(meeting)) return null
  const title = str(meeting['meetingtitle'])
  const info = isObject(meeting['scheduledmeetinginfo']) ? meeting['scheduledmeetinginfo'] : {}
  const start = isoOrNull(info['startTime'])
  const end = isoOrNull(info['endTime'])
  const cancelled = info['isCancelled'] === true || info['isCancelled'] === 'true'
  const location = str(meeting['location'])
  const lines = [`📅 ${cancelled ? '（取消）' : ''}${escapeMarkdownText(decodeEntities(title ?? 'イベント'))}`]
  if (start) lines.push(`日時: ${formatEventDate(start, timeZone)}${end ? ` 〜 ${formatEventDate(end, timeZone)}` : ''}（${timeZone}）`)
  // Teams 会議の参加用の場所表記は過去ログとして意味がないので残さない
  if (location && location !== 'Microsoft Teams Meeting') lines.push(`場所: ${escapeMarkdownText(decodeEntities(location))}`)
  return lines.join('\n')
}

function externalFiles(filesJson: unknown): ImportExternalFile[] {
  const parsed = parseJsonString(filesJson)
  if (!Array.isArray(parsed)) return []
  const result: ImportExternalFile[] = []
  for (const item of parsed) {
    if (!isObject(item)) continue
    const fileName = (str(item['fileName']) ?? str(item['title']) ?? 'ファイル').slice(0, 255)
    const info = isObject(item['fileInfo']) ? item['fileInfo'] : {}
    const candidate = str(info['shareUrl']) ?? str(info['fileUrl']) ?? str(item['objectUrl'])
    let url: string | null = null
    if (candidate) {
      try {
        const parsedUrl = new URL(candidate)
        if (parsedUrl.protocol === 'https:') url = parsedUrl.toString()
      } catch {
        url = null
      }
    }
    const uploadError = String(item['isUploadError']).toLowerCase() === 'true'
    result.push({ fileName, url: uploadError ? null : url, uploadError })
  }
  return result
}

function externalFilesText(files: ImportExternalFile[]): string {
  if (files.length === 0) return ''
  const lines = files.map(file => {
    const name = escapeMarkdownText(file.fileName)
    if (file.uploadError) return `- ${name}（Teams でのアップロードに失敗していたファイル）`
    if (!file.url) return `- ${name}（リンクなし）`
    return `- [${name}](${encodeLinkUrl(file.url)})`
  })
  return ['📎 添付ファイルのリンク（ファイル本体は取り込まれていません）', ...lines].join('\n')
}

interface RawMessage {
  id: string
  conversationId: string
  messageType: string
  content: string
  from: string | null
  displayName: string | null
  arrival: string | null
  properties: Json
  amsReferences: string[]
}

function readMessage(value: unknown, conversationId: string): RawMessage | null {
  if (!isObject(value)) return null
  const id = str(value['id'])
  if (!id || !/^\d{1,20}$/.test(id)) return null
  return {
    id,
    conversationId,
    messageType: str(value['messagetype']) ?? '',
    content: str(value['content']) ?? '',
    from: str(value['from']),
    displayName: str(value['displayName']),
    arrival: isoOrNull(value['originalarrivaltime']) ?? epochToIso(id),
    properties: isObject(value['properties']) ? value['properties'] : {},
    amsReferences: Array.isArray(value['amsreferences'])
      ? value['amsreferences'].filter((r): r is string => typeof r === 'string' && /^[A-Za-z0-9-]{1,80}$/.test(r))
      : [],
  }
}

/**
 * リアクションした人の識別。`emotions`（表示名）と `deltaEmotions`（ID）を
 * 「リアクション名 + 時刻」で突き合わせ、ID と表示名の対応を作る。
 */
function collectReactionIdentities(messages: RawMessage[]) {
  const mriToNames = new Map<string, Set<string>>()
  for (const message of messages) {
    const emotions = Array.isArray(message.properties['emotions']) ? message.properties['emotions'] : []
    const delta = Array.isArray(message.properties['deltaEmotions']) ? message.properties['deltaEmotions'] : []
    const nameByKeyTime = new Map<string, string>()
    for (const emotion of emotions) {
      if (!isObject(emotion) || !Array.isArray(emotion['users'])) continue
      for (const user of emotion['users']) {
        if (!isObject(user)) continue
        const name = str(user['DisplayName'])
        if (name) nameByKeyTime.set(`${str(emotion['key'])}|${String(user['time'])}`, name)
      }
    }
    for (const emotion of delta) {
      if (!isObject(emotion) || !Array.isArray(emotion['users'])) continue
      for (const user of emotion['users']) {
        if (!isObject(user)) continue
        const mri = str(user['mri'])
        const name = nameByKeyTime.get(`${str(emotion['key'])}|${String(user['time'])}`)
        if (!mri || !name) continue
        const names = mriToNames.get(mri) ?? new Set<string>()
        names.add(name)
        mriToNames.set(mri, names)
      }
    }
  }
  return mriToNames
}

export function parseTeamsExport(input: unknown, options: ParseTeamsExportOptions = {}): ImportBundle {
  const timeZone = options.timeZone ?? 'UTC'
  if (!isObject(input) || !Array.isArray(input['conversations'])) {
    throw new TeamsExportFormatError('messages.json の形式が Teams のエクスポートと一致しません（conversations がありません）')
  }
  const rawConversations = input['conversations']
  if (rawConversations.length > MAX_CONVERSATIONS) {
    throw new TeamsExportFormatError(`会話が多すぎます（上限 ${MAX_CONVERSATIONS} 件）`)
  }
  const exporterMri = str(input['userId'])
  const exporterKey = exporterMri ? `mri:${exporterMri}` : null

  const identities = new Map<string, ImportIdentity>()
  const addIdentity = (identity: ImportIdentity) => {
    const existing = identities.get(identity.key)
    if (!existing) identities.set(identity.key, identity)
    else if (!existing.displayName && identity.displayName) existing.displayName = identity.displayName
  }
  addIdentity({ key: ANONYMOUS_IDENTITY_KEY, displayName: null, anonymous: true, kind: 'anonymous' })
  if (exporterKey) addIdentity({ key: exporterKey, displayName: null, anonymous: false, kind: 'exporter' })

  // まず全会話のメッセージを読み、リアクションから ID と表示名の対応を作る
  const conversationsRaw: Array<{ id: string; name: string | null; memberCount: number; messages: RawMessage[] }> = []
  for (const conversation of rawConversations) {
    if (!isObject(conversation)) continue
    const id = str(conversation['id'])
    if (!id || id.length > 200) continue
    const thread = isObject(conversation['threadProperties']) ? conversation['threadProperties'] : {}
    const name = (str(thread['topic']) || str(conversation['displayName']) || '').trim() || null
    const memberCountRaw = thread['membercount']
    const memberCount = typeof memberCountRaw === 'number' && memberCountRaw >= 0 ? Math.floor(memberCountRaw) : 0
    const list = Array.isArray(conversation['MessageList']) ? conversation['MessageList'] : []
    const messages: RawMessage[] = []
    for (const raw of list) {
      const message = readMessage(raw, id)
      if (message) messages.push(message)
    }
    conversationsRaw.push({ id, name: name ? name.slice(0, 200) : null, memberCount, messages })
  }

  const allMessages = conversationsRaw.flatMap(c => c.messages)
  const mriToNames = collectReactionIdentities(allMessages)
  // 表示名 → ID（同じ表示名が1人の ID にしか対応しないときだけ）
  const nameToMri = new Map<string, string | null>()
  for (const [mri, names] of mriToNames) {
    if (names.size !== 1) continue
    const name = [...names][0]!
    if (name === TEAMS_UNKNOWN_USER_LABEL || name === TEAMS_EXPORT_OWNER_LABEL) continue
    nameToMri.set(name, nameToMri.has(name) && nameToMri.get(name) !== mri ? null : mri)
  }

  const identityKeyForName = (name: string): string => {
    const mri = nameToMri.get(name)
    const key = mri ? `mri:${mri}` : `name:${name}`
    addIdentity({ key, displayName: name, anonymous: false, kind: 'named' })
    return key
  }

  const identityKeyForReactor = (mri: string | null, name: string | null): string => {
    if (mri && mri === exporterMri) return exporterKey!
    const named = name && name !== TEAMS_UNKNOWN_USER_LABEL && name !== TEAMS_EXPORT_OWNER_LABEL ? name : null
    if (named) return identityKeyForName(named)
    if (mri) {
      addIdentity({ key: `mri:${mri}`, displayName: null, anonymous: false, kind: 'unnamed-participant' })
      return `mri:${mri}`
    }
    return ANONYMOUS_IDENTITY_KEY
  }

  const conversations: ImportConversation[] = []
  const messagesByConversation: Record<string, ImportMessage[]> = {}
  const skipped: ImportSkippedMessage[] = []

  for (const conversation of conversationsRaw) {
    const kind = teamsConversationKind(conversation.id)
    const sorted = [...conversation.messages].sort((a, b) => (a.arrival ?? '').localeCompare(b.arrival ?? '') || a.id.localeCompare(b.id))
    const imported: ImportMessage[] = []
    const seen = new Set<string>()
    for (const message of sorted) {
      if (seen.has(message.id)) continue
      seen.add(message.id)
      const skip = (reason: ImportSkippedMessage['reason']) =>
        skipped.push({ conversationExternalId: conversation.id, externalId: message.id, reason })

      if (message.messageType.startsWith('ThreadActivity/')) { skip('system'); continue }
      if (message.messageType.startsWith('Event/')) { skip('call'); continue }
      if (!USER_MESSAGE_TYPES.has(message.messageType)) { skip('unsupported-type'); continue }
      if (message.properties['deletetime'] != null || message.properties['hardDeleteTime'] != null) { skip('deleted'); continue }
      if (!message.arrival) { skip('unsupported-type'); continue }

      const meeting = parseJsonString(message.properties['meeting'])
      const isEventCard = isObject(meeting)
      let text: string
      let mediaIds: string[] = []
      let mentionCount = 0
      if (isEventCard) {
        text = eventCardText(meeting, timeZone) ?? ''
      } else if (message.messageType === 'Text') {
        text = teamsPlainToText(message.content)
      } else {
        const converted = teamsHtmlToText(message.content)
        text = converted.text
        mediaIds = converted.mediaObjectIds
        mentionCount = converted.mentionCount
      }
      const subject = str(message.properties['subject'])?.trim()
      if (subject) text = `**${escapeMarkdownText(decodeEntities(subject))}**${text ? `\n${text}` : ''}`

      const files = externalFiles(message.properties['files'])
      const filesText = externalFilesText(files)
      if (filesText) text = text ? `${text}\n\n${filesText}` : filesText
      if (text.length > MAX_TEXT_LENGTH) text = `${text.slice(0, MAX_TEXT_LENGTH)}\n\n（長すぎるため以降を省略しました）`

      const media = [...new Set([...message.amsReferences, ...mediaIds])].map(objectId => ({ objectId }))
      if (!text && media.length === 0) { skip('empty'); continue }

      // 投稿者: 本人（ID あり）> 表示名あり > 不明。表示名の無い投稿を誰かに割り当てない
      let identityKey = ANONYMOUS_IDENTITY_KEY
      if (message.from && exporterMri && message.from === exporterMri) identityKey = exporterKey!
      else if (message.from) {
        identityKey = `mri:${message.from}`
        addIdentity({ key: identityKey, displayName: message.displayName, anonymous: false, kind: message.displayName ? 'named' : 'unnamed-participant' })
      } else if (message.displayName && message.displayName !== TEAMS_UNKNOWN_USER_LABEL) {
        identityKey = identityKeyForName(message.displayName)
      }

      const reactions: ImportReaction[] = []
      const emotions = Array.isArray(message.properties['emotions']) ? message.properties['emotions'] : []
      const delta = Array.isArray(message.properties['deltaEmotions']) ? message.properties['deltaEmotions'] : []
      const mriByKeyTime = new Map<string, string>()
      for (const emotion of delta) {
        if (!isObject(emotion) || !Array.isArray(emotion['users'])) continue
        for (const user of emotion['users']) {
          if (isObject(user) && str(user['mri'])) mriByKeyTime.set(`${str(emotion['key'])}|${String(user['time'])}`, str(user['mri'])!)
        }
      }
      for (const emotion of emotions) {
        if (!isObject(emotion) || !Array.isArray(emotion['users'])) continue
        const sourceKey = str(emotion['key'])
        if (!sourceKey) continue
        for (const user of emotion['users']) {
          if (!isObject(user)) continue
          const reactedAt = epochToIso(user['time'])
          if (!reactedAt) continue
          const mri = mriByKeyTime.get(`${sourceKey}|${String(user['time'])}`) ?? null
          reactions.push({
            identityKey: identityKeyForReactor(mri, str(user['DisplayName'])),
            emoji: teamsReactionToEmoji(sourceKey),
            sourceKey: sourceKey.slice(0, 60),
            reactedAt,
          })
        }
      }

      const quoted = Array.isArray(message.properties['qtdMsgs']) ? message.properties['qtdMsgs'] : []
      const quotedId = quoted.map(q => (isObject(q) ? String(q['messageId'] ?? '') : '')).find(id => /^\d{1,20}$/.test(id)) ?? null

      imported.push({
        externalId: message.id,
        conversationExternalId: conversation.id,
        identityKey,
        sentAt: message.arrival,
        editedAt: epochToIso(message.properties['edittime']),
        text,
        quotedExternalId: quotedId && quotedId !== message.id ? quotedId : null,
        reactions,
        media,
        externalFiles: files,
        attributes: {
          messageType: message.messageType,
          senderIdPresent: !!message.from,
          senderNamePresent: !!message.displayName,
          hasSubject: !!subject,
          isEventCard,
          mentionCount,
        },
      })
    }
    messagesByConversation[conversation.id] = imported
    const times = imported.map(m => m.sentAt)
    conversations.push({
      externalId: conversation.id,
      kind,
      name: conversation.name,
      memberCount: conversation.memberCount,
      importable: kind === 'group',
      firstMessageAt: times[0] ?? null,
      lastMessageAt: times[times.length - 1] ?? null,
    })
  }

  return {
    source: 'teams-consumer',
    exportedAt: isoOrNull(input['exportDate']),
    exporterKey,
    identities: [...identities.values()],
    conversations,
    messagesByConversation,
    skipped,
  }
}
