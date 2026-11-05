// Copyright 2026 Cairn Contributors
// SPDX-License-Identifier: Apache-2.0

import type { ImportBundle, ImportIdentity, ImportMessage } from '@cairn/core/import'

/**
 * ブラウザ側で行う取り込みの準備と実行（docs/import-design.md）。
 * エクスポートのフォルダ全体はサーバーへ送らず、messages.json の必要な部分と、メッセージから参照される画像だけを送る。
 */

export const MAX_MEDIA_SIZE = 50 * 1024 * 1024
/** Vercel の Function のリクエスト上限（4.5MB）より十分小さくする */
export const MAX_BATCH_BYTES = 2_500_000
export const MAX_BATCH_COUNT = 200

const IMAGE_MIME: Record<string, string> = { jpg: 'image/jpeg', jpeg: 'image/jpeg', png: 'image/png', gif: 'image/gif', webp: 'image/webp' }
const MEDIA_NAME_RE = /^([A-Za-z0-9-]{1,80})\.\d{1,3}\.([A-Za-z0-9]{1,5})$/

export type MediaRejectReason = 'unsupported-type' | 'too-large'

export interface CollectedExport {
  messagesFile: File | null
  /** AMS オブジェクト ID → 取り込める画像ファイル */
  media: Map<string, { file: File; mimeType: string }>
  /** 取り込めないメディア（動画など） */
  rejectedMedia: Map<string, MediaRejectReason>
  /** 読み込まずに無視したファイル数（endpoints.json・invites.json など） */
  ignoredFiles: number
}

/** ファイルの相対パス（フォルダ選択時は webkitRelativePath）を正規化する。`..` などを含むものは扱わない */
export function relativeExportPath(file: Pick<File, 'name'> & { webkitRelativePath?: string }): string | null {
  const raw = (file.webkitRelativePath || file.name).replace(/\\/g, '/')
  const parts = raw.split('/').filter(Boolean)
  if (parts.some(part => part === '..' || part === '.')) return null
  // フォルダを選んだ場合は先頭がフォルダ名になる
  return parts.length > 1 ? parts.slice(1).join('/') : parts[0] ?? null
}

/**
 * 選ばれたファイルから、messages.json と media/ の画像だけを選別する。
 * endpoints.json（端末の鍵）・invites.json（招待リンク）などは読まない。
 */
export function collectExportFiles(files: Array<File & { webkitRelativePath?: string }>): CollectedExport {
  const result: CollectedExport = { messagesFile: null, media: new Map(), rejectedMedia: new Map(), ignoredFiles: 0 }
  for (const file of files) {
    const path = relativeExportPath(file)
    if (!path) { result.ignoredFiles++; continue }
    if (path === 'messages.json') { result.messagesFile = file; continue }
    const mediaMatch = /^media\/([^/]+)$/.exec(path)
    const match = mediaMatch ? MEDIA_NAME_RE.exec(mediaMatch[1]!) : null
    if (!match) { result.ignoredFiles++; continue }
    const objectId = match[1]!
    const mimeType = IMAGE_MIME[match[2]!.toLowerCase()]
    if (!mimeType) { result.rejectedMedia.set(objectId, 'unsupported-type'); continue }
    if (file.size > MAX_MEDIA_SIZE) { result.rejectedMedia.set(objectId, 'too-large'); continue }
    // 同じオブジェクトに複数のファイルがある場合は先頭（.1）を使う
    const existing = result.media.get(objectId)
    if (!existing || file.name < existing.file.name) result.media.set(objectId, { file, mimeType })
  }
  return result
}

/** 選んだ会話のメッセージ・リアクションに出てくる投稿者だけを、件数付きで返す */
export function identitiesForConversations(bundle: ImportBundle, conversationIds: string[]) {
  const counts = new Map<string, { messages: number; reactions: number }>()
  for (const id of conversationIds) {
    for (const message of bundle.messagesByConversation[id] ?? []) {
      const entry = counts.get(message.identityKey) ?? { messages: 0, reactions: 0 }
      entry.messages++
      counts.set(message.identityKey, entry)
      for (const reaction of message.reactions) {
        const r = counts.get(reaction.identityKey) ?? { messages: 0, reactions: 0 }
        r.reactions++
        counts.set(reaction.identityKey, r)
      }
    }
  }
  return bundle.identities
    .filter(identity => counts.has(identity.key))
    .map(identity => ({ identity, ...counts.get(identity.key)! }))
    .sort((a, b) => b.messages - a.messages || b.reactions - a.reactions)
}

function normalizeName(name: string): string {
  return name.normalize('NFKC').replace(/\s+/g, '').toLowerCase()
}

/**
 * 表示名が完全に一致する（空白・全角半角・大文字小文字の違いを除く）メンバーを紐づけ候補として返す。
 * 候補は表示するだけで、管理者が選ぶまで紐づけない。同じ名前のメンバーが複数いれば候補にしない。
 */
export function suggestMember<T extends { userId: string; displayName: string }>(identity: ImportIdentity, members: T[]): T | null {
  if (identity.anonymous || !identity.displayName) return null
  const target = normalizeName(identity.displayName)
  const matches = members.filter(member => normalizeName(member.displayName) === target)
  return matches.length === 1 ? matches[0]! : null
}

export function toBatchMessage(message: ImportMessage, availableMedia: Set<string>) {
  return {
    externalId: message.externalId,
    identityKey: message.identityKey,
    sentAt: message.sentAt,
    editedAt: message.editedAt,
    text: message.text,
    quotedExternalId: message.quotedExternalId,
    reactions: message.reactions,
    mediaObjectIds: message.media.map(m => m.objectId).filter(id => availableMedia.has(id)),
    attributes: message.attributes,
  }
}

export type BatchMessage = ReturnType<typeof toBatchMessage>

/** バイト数と件数の両方の上限でメッセージを分ける */
export function chunkMessages(messages: BatchMessage[], maxBytes = MAX_BATCH_BYTES, maxCount = MAX_BATCH_COUNT): BatchMessage[][] {
  const encoder = new TextEncoder()
  const chunks: BatchMessage[][] = []
  let current: BatchMessage[] = []
  let bytes = 0
  for (const message of messages) {
    const size = encoder.encode(JSON.stringify(message)).length + 1
    if (current.length > 0 && (bytes + size > maxBytes || current.length >= maxCount)) {
      chunks.push(current)
      current = []
      bytes = 0
    }
    current.push(message)
    bytes += size
  }
  if (current.length > 0) chunks.push(current)
  return chunks
}

export interface ImportPlanConversation {
  externalId: string
  channelId: string
}

export interface ImportApi {
  createJob(body: unknown): Promise<{ jobId: string }>
  lookupMedia(jobId: string, objectIds: string[]): Promise<Record<string, string>>
  uploadMedia(channelId: string, file: File): Promise<{ fileId: string }>
  registerMedia(jobId: string, body: { objectId: string; fileId: string; channelId: string }): Promise<{ fileId: string }>
  importBatch(jobId: string, body: { conversationExternalId: string; messages: BatchMessage[] }): Promise<{ imported: number; duplicates: number; missingMedia: number; attachments: number; reactions: number; quotesLinked: number; quotesUnresolved: number }>
  completeJob(jobId: string, body: unknown): Promise<unknown>
}

export interface ImportProgress {
  phase: 'creating' | 'media' | 'messages' | 'completing' | 'done'
  mediaDone: number
  mediaTotal: number
  messagesDone: number
  messagesTotal: number
}

export interface ImportRunResult {
  jobId: string
  status: 'completed' | 'failed' | 'cancelled'
  imported: number
  duplicates: number
  attachments: number
  reactions: number
  quotesLinked: number
  quotesUnresolved: number
  mediaFailures: Array<{ objectId: string; reason: 'missing-file' | 'unsupported-type' | 'too-large' | 'upload-failed' }>
  error: string | null
}

export async function runImport(args: {
  api: ImportApi
  bundle: ImportBundle
  plan: ImportPlanConversation[]
  links: Array<{ key: string; userId: string }>
  collected: Pick<CollectedExport, 'media' | 'rejectedMedia'>
  onProgress?: (progress: ImportProgress) => void
  signal?: AbortSignal
}): Promise<ImportRunResult> {
  const { api, bundle, plan, links, collected, onProgress, signal } = args
  const conversationIds = plan.map(p => p.externalId)
  const identities = identitiesForConversations(bundle, conversationIds).map(entry => entry.identity)
  const progress: ImportProgress = { phase: 'creating', mediaDone: 0, mediaTotal: 0, messagesDone: 0, messagesTotal: 0 }
  const emit = () => onProgress?.({ ...progress })
  const totals = { imported: 0, duplicates: 0, attachments: 0, reactions: 0, quotesLinked: 0, quotesUnresolved: 0 }
  const mediaFailures: ImportRunResult['mediaFailures'] = []

  progress.messagesTotal = conversationIds.reduce((n, id) => n + (bundle.messagesByConversation[id]?.length ?? 0), 0)
  emit()
  const { jobId } = await api.createJob({
    source: bundle.source,
    exportedAt: bundle.exportedAt,
    conversations: plan.map(p => ({ externalId: p.externalId, channelId: p.channelId, totalMessages: bundle.messagesByConversation[p.externalId]?.length ?? 0 })),
    identities,
    links,
  })

  const finish = async (status: ImportRunResult['status'], error: string | null): Promise<ImportRunResult> => {
    progress.phase = 'completing'
    emit()
    await api.completeJob(jobId, {
      status,
      error,
      report: {
        conversations: plan.map(p => {
          const messages = bundle.messagesByConversation[p.externalId] ?? []
          const skipped = bundle.skipped.filter(s => s.conversationExternalId === p.externalId)
          const anonymousKeys = new Set(bundle.identities.filter(i => i.anonymous).map(i => i.key))
          return {
            externalId: p.externalId,
            counts: {
              messages: messages.length,
              anonymousMessages: messages.filter(m => anonymousKeys.has(m.identityKey)).length,
              editedWithoutHistory: messages.filter(m => m.editedAt).length,
              deletedSkipped: skipped.filter(s => s.reason === 'deleted').length,
              systemSkipped: skipped.filter(s => s.reason === 'system' || s.reason === 'call').length,
              emptySkipped: skipped.filter(s => s.reason === 'empty').length,
              unsupportedSkipped: skipped.filter(s => s.reason === 'unsupported-type').length,
              externalFileLinks: messages.reduce((n, m) => n + m.externalFiles.length, 0),
              mentionsAsText: messages.reduce((n, m) => n + m.attributes.mentionCount, 0),
            },
          }
        }),
        excludedConversations: bundle.conversations
          .filter(c => !conversationIds.includes(c.externalId))
          .reduce<Record<string, number>>((acc, c) => ({ ...acc, [c.kind]: (acc[c.kind] ?? 0) + 1 }), {}),
        mediaFailures: mediaFailures.slice(0, 10_000),
      },
    })
    progress.phase = 'done'
    emit()
    return { jobId, status, ...totals, mediaFailures, error }
  }

  try {
    // 1. メディア: 参照されるものだけ。アップロード済み（再実行）のものは使い回し、同じオブジェクトは1回だけ送る
    const firstChannelForObject = new Map<string, string>()
    for (const p of plan) {
      for (const message of bundle.messagesByConversation[p.externalId] ?? []) {
        for (const ref of message.media) if (!firstChannelForObject.has(ref.objectId)) firstChannelForObject.set(ref.objectId, p.channelId)
      }
    }
    const objectIds = [...firstChannelForObject.keys()]
    progress.phase = 'media'
    progress.mediaTotal = objectIds.length
    emit()
    const available = new Set<string>()
    for (let i = 0; i < objectIds.length; i += 500) {
      const found = await api.lookupMedia(jobId, objectIds.slice(i, i + 500))
      for (const objectId of Object.keys(found)) available.add(objectId)
    }
    for (const objectId of objectIds) {
      if (signal?.aborted) return await finish('cancelled', null)
      if (!available.has(objectId)) {
        const rejected = collected.rejectedMedia.get(objectId)
        const media = collected.media.get(objectId)
        if (rejected) mediaFailures.push({ objectId, reason: rejected })
        else if (!media) mediaFailures.push({ objectId, reason: 'missing-file' })
        else {
          try {
            const channelId = firstChannelForObject.get(objectId)!
            const uploaded = await api.uploadMedia(channelId, media.file)
            await api.registerMedia(jobId, { objectId, fileId: uploaded.fileId, channelId })
            available.add(objectId)
          } catch {
            mediaFailures.push({ objectId, reason: 'upload-failed' })
          }
        }
      }
      progress.mediaDone++
      emit()
    }

    // 2. メッセージ: 会話ごと・投稿日時順にバッチで送る。失敗したら止めて、再実行で続きから入れる
    progress.phase = 'messages'
    emit()
    for (const p of plan) {
      const messages = (bundle.messagesByConversation[p.externalId] ?? []).map(m => toBatchMessage(m, available))
      for (const chunk of chunkMessages(messages)) {
        if (signal?.aborted) return await finish('cancelled', null)
        const result = await api.importBatch(jobId, { conversationExternalId: p.externalId, messages: chunk })
        totals.imported += result.imported
        totals.duplicates += result.duplicates
        totals.attachments += result.attachments
        totals.reactions += result.reactions
        totals.quotesLinked += result.quotesLinked
        totals.quotesUnresolved += result.quotesUnresolved
        progress.messagesDone += chunk.length
        emit()
      }
    }
    return await finish('completed', null)
  } catch (err) {
    const message = err instanceof Error ? err.message.slice(0, 300) : 'unknown error'
    try {
      return await finish('failed', message)
    } catch {
      return { jobId, status: 'failed', ...totals, mediaFailures, error: message }
    }
  }
}
