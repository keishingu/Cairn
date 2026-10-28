// Copyright 2026 Cairn Contributors
// SPDX-License-Identifier: Apache-2.0

// AIアシスタントの会話への添付（docs/10_ai_member_design.md「会話への添付」）。
// - 本体は非公開の ai-attachments バケットに、署名付き URL でクライアントから直接上げる（Vercel の本文上限を避ける）
// - 画像は AI にそのまま見せ、文書は取り出した本文を「未信頼の添付データ」として渡す
// - ファイル一覧には出さず、会話を消すまで残す。送られずに残ったものは定期回収する

import type { FilePart, ImagePart, TextPart } from 'ai'
import { normalizeMimeType } from '@/lib/attachments'
import type { AuthContext } from '@/lib/get-auth-context'
import { createServiceRoleClient } from '@/lib/supabase/service'
import {
  AI_ATTACHMENT_IMAGE_TYPES,
  AI_ATTACHMENT_MAX_BYTES,
  AI_ATTACHMENT_MAX_FILES,
  isAiAttachmentType,
} from './attachment-types'
import { extractText } from './extract-text'

export { AI_ATTACHMENT_MAX_BYTES, AI_ATTACHMENT_MAX_FILES } from './attachment-types'

export const AI_ATTACHMENT_BUCKET = 'ai-attachments'
/** 1ファイルから AI に渡す本文の上限（文字数）。超えた分は切り詰め、切り詰めたことを AI に伝える */
export const AI_ATTACHMENT_MAX_TEXT_CHARS = 50_000
/** 送る前の添付を1つの会話に溜められる上限（アップロードだけを繰り返して Storage を埋めさせない） */
const MAX_UNSENT_PER_CONVERSATION = 10
/** 履歴の画像を AI に見せ直す上限（古い画像まで毎回読み込まない） */
const MAX_HISTORY_IMAGES = 4
/**
 * AI に渡す文書の本文の合計の上限（文字数）。今回の依頼に付けた文書と、履歴の文書で別々に数える。
 * 1文書は5万文字までだが、5つ付けたり何度も付けたりすると、送るたびに全部を渡してモデルの入力の上限を超え、
 * その会話は以降ずっと回答できなくなる。履歴は新しい文書から数え、上限を超えた古い文書はファイル名だけを伝える
 */
export const AI_ATTACHMENT_REQUEST_MAX_TEXT_CHARS = 150_000
export const AI_ATTACHMENT_HISTORY_MAX_TEXT_CHARS = 100_000

/** 本文を渡さず、ファイル名だけを伝える添付（古い画像・上限を超えた古い文書） */
export type OmittedAttachment =
  | { kind: 'omitted-image'; id: string; fileName: string }
  | { kind: 'omitted-document'; id: string; fileName: string }
export type HistoryAttachment = PreparedAttachment | OmittedAttachment
/** 送られずに残った添付を回収するまでの時間 */
export const AI_ATTACHMENT_UNSENT_TTL_MS = 24 * 60 * 60 * 1000
/**
 * 送信に使える添付は、アップロードから回収の1時間前までのもの。1回の送信（最長5分）の間に回収が本体を消し、
 * 依頼には結び付いたのに本体だけが無い添付ができないよう、回収と送信が同じ添付に触れない時間帯を空ける
 */
export const AI_ATTACHMENT_SENDABLE_MS = AI_ATTACHMENT_UNSENT_TTL_MS - 60 * 60 * 1000
const READ_URL_TTL_SECONDS = 60 * 60

export class AiAttachmentError extends Error {
  constructor(
    readonly status: 400 | 403 | 404 | 409 | 413 | 422 | 500,
    message: string,
  ) {
    super(message)
  }
}

export interface AiAttachmentDto {
  id: string
  fileName: string
  mimeType: string
  fileSize: number
  /** 期限付きの読み出し URL（画像の表示・ファイルを開く用）。発行に失敗したときは null（画面は開けないことを表示する） */
  url: string | null
}

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i

async function requireOwnConversation(ctx: AuthContext, conversationId: string): Promise<void> {
  // UUID の列に形の崩れた ID を渡すと DB エラー（500）になるため、見つからない扱いにする
  if (!UUID_RE.test(conversationId)) throw new AiAttachmentError(404, '会話が見つかりません')
  const { aiConversations, db } = await import('@cairn/db')
  const { and, eq } = await import('drizzle-orm')
  const [conversation] = await db
    .select({ id: aiConversations.id })
    .from(aiConversations)
    .where(
      and(
        eq(aiConversations.id, conversationId),
        eq(aiConversations.workspaceId, ctx.workspaceId),
        eq(aiConversations.createdBy, ctx.userId),
      ),
    )
    .limit(1)
  if (!conversation) throw new AiAttachmentError(404, '会話が見つかりません')
}

/** 添付の行を作り、署名付きアップロード URL を返す。本体はクライアントから Storage へ直接送る */
export async function createAiAttachmentUpload(
  ctx: AuthContext,
  conversationId: string,
  input: { fileName: string; mimeType: string; fileSize: number },
): Promise<{ attachmentId: string; path: string; token: string; mimeType: string }> {
  const fileName = input.fileName.trim().slice(0, 255)
  if (!fileName) throw new AiAttachmentError(400, 'ファイル名がありません')
  const mimeType = normalizeMimeType(fileName, input.mimeType)
  if (!isAiAttachmentType(mimeType)) {
    throw new AiAttachmentError(422, '添付できるのは画像（JPEG・PNG・GIF・WebP）・PDF・Word・Excel・PowerPoint・CSV・テキスト・Markdown です')
  }
  if (!Number.isInteger(input.fileSize) || input.fileSize <= 0) throw new AiAttachmentError(400, 'ファイルが空です')
  if (input.fileSize > AI_ATTACHMENT_MAX_BYTES) throw new AiAttachmentError(413, 'AIアシスタントに添付できるファイルは1つ10MBまでです')

  await requireOwnConversation(ctx, conversationId)
  const { aiAttachments, db } = await import('@cairn/db')
  const { and, count, eq, isNull } = await import('drizzle-orm')
  const [{ value } = { value: 0 }] = await db
    .select({ value: count() })
    .from(aiAttachments)
    .where(and(eq(aiAttachments.conversationId, conversationId), isNull(aiAttachments.messageId)))
  if (Number(value) >= MAX_UNSENT_PER_CONVERSATION) {
    throw new AiAttachmentError(409, '送信前の添付が多すぎます。不要な添付を外すか、送信してから追加してください')
  }

  const id = crypto.randomUUID()
  const extension = fileName.includes('.') ? fileName.split('.').pop()!.toLowerCase().replace(/[^a-z0-9]/g, '').slice(0, 10) : ''
  const storagePath = `${ctx.workspaceId}/${ctx.userId}/${conversationId}/${id}${extension ? `.${extension}` : ''}`
  await db.insert(aiAttachments).values({
    id,
    workspaceId: ctx.workspaceId,
    conversationId,
    uploadedBy: ctx.userId,
    fileName,
    mimeType,
    fileSize: input.fileSize,
    storagePath,
  })

  const { data, error } = await createServiceRoleClient().storage.from(AI_ATTACHMENT_BUCKET).createSignedUploadUrl(storagePath)
  if (error || !data) {
    await db.delete(aiAttachments).where(eq(aiAttachments.id, id))
    console.error('[ai attachments] createSignedUploadUrl failed:', error)
    throw new AiAttachmentError(500, 'アップロードURLの発行に失敗しました')
  }
  return { attachmentId: id, path: data.path, token: data.token, mimeType }
}

/** 送信前の添付を外す（本体も消す） */
export async function deleteUnsentAiAttachment(ctx: AuthContext, conversationId: string, attachmentId: string): Promise<void> {
  if (!UUID_RE.test(conversationId) || !UUID_RE.test(attachmentId)) {
    throw new AiAttachmentError(404, '添付が見つかりません（送信済みか、すでに外されています）')
  }
  const { aiAttachments, db } = await import('@cairn/db')
  const { and, eq, isNull } = await import('drizzle-orm')
  const [row] = await db
    .select({ storagePath: aiAttachments.storagePath })
    .from(aiAttachments)
    .where(
      and(
        eq(aiAttachments.id, attachmentId),
        // 認証したワークスペースの添付に限る（非活性になった別ワークスペースの添付を、所属が続くワークスペースから消させない）
        eq(aiAttachments.workspaceId, ctx.workspaceId),
        eq(aiAttachments.conversationId, conversationId),
        eq(aiAttachments.uploadedBy, ctx.userId),
        isNull(aiAttachments.messageId),
      ),
    )
    .limit(1)
  if (!row) throw new AiAttachmentError(404, '添付が見つかりません（送信済みか、すでに外されています）')
  const { error } = await createServiceRoleClient().storage.from(AI_ATTACHMENT_BUCKET).remove([row.storagePath])
  if (error) {
    console.error('[ai attachments] remove failed:', error)
    throw new AiAttachmentError(500, '添付を外せませんでした。時間をおいてもう一度お試しください')
  }
  await db.delete(aiAttachments).where(eq(aiAttachments.id, attachmentId))
}

/** AI に渡す形にした添付。文書は取り出した本文、画像は本体のバイト列 */
export type PreparedAttachment =
  | { kind: 'document'; id: string; fileName: string; text: string; truncated: boolean }
  | { kind: 'image'; id: string; fileName: string; mimeType: string; data: Uint8Array }

async function download(storagePath: string): Promise<Uint8Array | null> {
  const { data, error } = await createServiceRoleClient().storage.from(AI_ATTACHMENT_BUCKET).download(storagePath)
  if (error || !data) return null
  return new Uint8Array(await data.arrayBuffer())
}

/** 文書の本文を取り出して保存する（続けて質問したときは保存した本文を使い、読み直さない） */
async function extractAndStore(row: { id: string; fileName: string; mimeType: string }, bytes: Uint8Array) {
  let text: string
  try {
    text = (await extractText(Buffer.from(bytes), row.mimeType)).trim()
  } catch (error) {
    console.error('[ai attachments] extract failed', row.id, error)
    throw new AiAttachmentError(422, `${row.fileName} から本文を取り出せませんでした。ファイルが壊れていないか確認してください`)
  }
  const truncated = text.length > AI_ATTACHMENT_MAX_TEXT_CHARS
  const stored = truncated ? text.slice(0, AI_ATTACHMENT_MAX_TEXT_CHARS) : text
  const { aiAttachments, db } = await import('@cairn/db')
  const { eq } = await import('drizzle-orm')
  await db.update(aiAttachments).set({ extractedText: stored, textTruncated: truncated }).where(eq(aiAttachments.id, row.id))
  return { text: stored, truncated }
}

/**
 * 送信する依頼に付ける添付を確かめて、AI に渡す形にする。本人がこの会話に上げた、まだ送っていない添付だけを受け付ける。
 * 見つからない・アップロードが終わっていない・本文を取り出せないものは、黙って外さずにエラーにする
 */
export async function prepareAttachmentsForSend(
  ctx: AuthContext,
  conversationId: string,
  attachmentIds: string[],
): Promise<PreparedAttachment[]> {
  if (attachmentIds.length === 0) return []
  const ids = [...new Set(attachmentIds)]
  if (ids.length > AI_ATTACHMENT_MAX_FILES) {
    throw new AiAttachmentError(422, `1回に添付できるファイルは${AI_ATTACHMENT_MAX_FILES}個までです`)
  }
  const { aiAttachments, db } = await import('@cairn/db')
  const { and, eq, gt, inArray, isNull } = await import('drizzle-orm')
  const rows = await db
    .select({
      id: aiAttachments.id,
      fileName: aiAttachments.fileName,
      mimeType: aiAttachments.mimeType,
      storagePath: aiAttachments.storagePath,
      extractedText: aiAttachments.extractedText,
      textTruncated: aiAttachments.textTruncated,
    })
    .from(aiAttachments)
    .where(
      and(
        inArray(aiAttachments.id, ids),
        eq(aiAttachments.workspaceId, ctx.workspaceId),
        eq(aiAttachments.conversationId, conversationId),
        eq(aiAttachments.uploadedBy, ctx.userId),
        isNull(aiAttachments.messageId),
        // 回収が近い（古い）添付は送らせない。回収と送信が同じ添付の本体と行を取り合わないようにする
        gt(aiAttachments.createdAt, new Date(Date.now() - AI_ATTACHMENT_SENDABLE_MS)),
      ),
    )
  if (rows.length !== ids.length) {
    throw new AiAttachmentError(422, '添付が見つかりません。送信済みか、時間がたって削除された可能性があります。添付し直してください')
  }
  const byId = new Map(rows.map((row) => [row.id, row]))
  const prepared: PreparedAttachment[] = []
  for (const id of ids) {
    const row = byId.get(id)!
    const bytes = await download(row.storagePath)
    if (!bytes) throw new AiAttachmentError(422, `${row.fileName} のアップロードが終わっていません。添付し直してください`)
    if (AI_ATTACHMENT_IMAGE_TYPES.has(row.mimeType)) {
      prepared.push({ kind: 'image', id: row.id, fileName: row.fileName, mimeType: row.mimeType, data: bytes })
    } else {
      const { text, truncated } = row.extractedText !== null
        ? { text: row.extractedText, truncated: row.textTruncated }
        : await extractAndStore(row, bytes)
      prepared.push({ kind: 'document', id: row.id, fileName: row.fileName, text, truncated })
    }
  }
  // 今回の依頼に付けた文書の本文は、合計の上限までにする（越えた分は切り詰めたことを伝える）
  let remaining = AI_ATTACHMENT_REQUEST_MAX_TEXT_CHARS
  return prepared.map((attachment) => {
    if (attachment.kind !== 'document') return attachment
    const fits = attachment.text.length <= remaining
    const text = fits ? attachment.text : attachment.text.slice(0, remaining)
    remaining -= text.length
    return fits ? attachment : { ...attachment, text, truncated: true }
  })
}

/**
 * 会話の履歴にある添付を、メッセージごとに AI に渡す形にする。新しいものから数え、
 * 画像は MAX_HISTORY_IMAGES 枚まで読み込み直し、文書は保存した本文を合計 AI_ATTACHMENT_HISTORY_MAX_TEXT_CHARS 文字まで渡す
 * （それより古いものはファイル名だけ伝える）
 */
export async function loadHistoryAttachments(
  conversationId: string,
  messageIds: string[],
): Promise<Map<string, HistoryAttachment[]>> {
  const result = new Map<string, HistoryAttachment[]>()
  if (messageIds.length === 0) return result
  const { aiAttachments, db } = await import('@cairn/db')
  const { and, desc, eq, inArray } = await import('drizzle-orm')
  const rows = await db
    .select({
      id: aiAttachments.id,
      messageId: aiAttachments.messageId,
      fileName: aiAttachments.fileName,
      mimeType: aiAttachments.mimeType,
      storagePath: aiAttachments.storagePath,
      extractedText: aiAttachments.extractedText,
      textTruncated: aiAttachments.textTruncated,
    })
    .from(aiAttachments)
    .where(and(eq(aiAttachments.conversationId, conversationId), inArray(aiAttachments.messageId, messageIds)))
    .orderBy(desc(aiAttachments.createdAt))
  let images = 0
  let documentChars = 0
  for (const row of rows) {
    if (!row.messageId) continue
    const list = result.get(row.messageId) ?? []
    if (AI_ATTACHMENT_IMAGE_TYPES.has(row.mimeType)) {
      if (images < MAX_HISTORY_IMAGES) {
        const bytes = await download(row.storagePath)
        // 読み込み直す対象なのに読めないときは、古いので省いたことにせずエラーにする（課金前に返す）
        if (!bytes) throw new AiAttachmentError(500, `以前に添付した ${row.fileName} を読み込めませんでした。時間をおいてもう一度お試しください`)
        images += 1
        list.unshift({ kind: 'image', id: row.id, fileName: row.fileName, mimeType: row.mimeType, data: bytes })
      } else {
        list.unshift({ kind: 'omitted-image', id: row.id, fileName: row.fileName })
      }
    } else {
      const text = row.extractedText ?? ''
      if (documentChars + text.length <= AI_ATTACHMENT_HISTORY_MAX_TEXT_CHARS) {
        documentChars += text.length
        list.unshift({ kind: 'document', id: row.id, fileName: row.fileName, text, truncated: row.textTruncated })
      } else {
        list.unshift({ kind: 'omitted-document', id: row.id, fileName: row.fileName })
      }
    }
    result.set(row.messageId, list)
  }
  return result
}

// 添付の名前・本文に区切りタグを閉じる文字列が入っていても、区切りの外へ出られないようにする
function neutralize(text: string): string {
  return text.replace(/<\/?\s*attached-file/gi, (tag) => tag.replace('<', '＜'))
}

/** 依頼の本文と添付を、AI に渡すメッセージの中身（テキスト・画像のパーツ）にする */
export function buildUserContentParts(
  text: string,
  attachments: ReadonlyArray<HistoryAttachment>,
): Array<TextPart | ImagePart | FilePart> {
  if (attachments.length === 0) return [{ type: 'text', text }]
  const parts: Array<TextPart | ImagePart | FilePart> = [{ type: 'text', text }]
  for (const attachment of attachments) {
    // ファイル名は属性値に入れるため、引用符と山括弧を全角にして属性・タグの外へ出られないようにする
    const name = neutralize(attachment.fileName).replace(/"/g, '”').replace(/</g, '＜').replace(/>/g, '＞')
    if (attachment.kind === 'image') {
      parts.push({ type: 'text', text: `<attached-file name="${name}" kind="image">利用者が添付した画像です。</attached-file>` })
      parts.push({ type: 'image', image: attachment.data, mimeType: attachment.mimeType })
    } else if (attachment.kind === 'omitted-image') {
      parts.push({ type: 'text', text: `<attached-file name="${name}" kind="image">以前に添付された画像です（古いため今回は読み込んでいません。必要なら添付し直すよう伝えてください）。</attached-file>` })
    } else if (attachment.kind === 'omitted-document') {
      parts.push({ type: 'text', text: `<attached-file name="${name}" kind="document">以前に添付された文書です（会話の添付の本文が多いため、古いこの文書は今回は読み込んでいません。必要なら添付し直すよう伝えてください）。</attached-file>` })
    } else {
      const body = attachment.text
        ? neutralize(attachment.text)
        : '（本文を取り出せませんでした。画像だけのPDFなどの可能性があります）'
      const note = attachment.truncated ? '\n（長いため途中までです。それ以降は読んでいません）' : ''
      parts.push({ type: 'text', text: `<attached-file name="${name}" kind="document">\n${body}${note}\n</attached-file>` })
    }
  }
  return parts
}

/** 会話のメッセージに付いた添付（表示用。期限付きの読み出し URL を付ける） */
export async function listMessageAttachments(conversationId: string): Promise<Map<string, AiAttachmentDto[]>> {
  const { aiAttachments, db } = await import('@cairn/db')
  const { and, asc, eq, isNotNull } = await import('drizzle-orm')
  const rows = await db
    .select({
      id: aiAttachments.id,
      messageId: aiAttachments.messageId,
      fileName: aiAttachments.fileName,
      mimeType: aiAttachments.mimeType,
      fileSize: aiAttachments.fileSize,
      storagePath: aiAttachments.storagePath,
    })
    .from(aiAttachments)
    .where(and(eq(aiAttachments.conversationId, conversationId), isNotNull(aiAttachments.messageId)))
    .orderBy(asc(aiAttachments.createdAt))
  const result = new Map<string, AiAttachmentDto[]>()
  if (rows.length === 0) return result
  const { data, error } = await createServiceRoleClient()
    .storage.from(AI_ATTACHMENT_BUCKET)
    .createSignedUrls(rows.map((row) => row.storagePath), READ_URL_TTL_SECONDS)
  // リンクを発行できなくても会話は読めるようにし、その添付だけを url: null で返す（画面で開けないことを表示する）
  if (error) console.error('[ai attachments] createSignedUrls failed:', error)
  for (const item of data ?? []) {
    if (item.error) console.error('[ai attachments] createSignedUrl failed for an object:', item.path, item.error)
  }
  const urlByPath = new Map((data ?? []).flatMap((item) => (item.path && item.signedUrl && !item.error ? [[item.path, item.signedUrl] as const] : [])))
  for (const row of rows) {
    const list = result.get(row.messageId!) ?? []
    list.push({ id: row.id, fileName: row.fileName, mimeType: row.mimeType, fileSize: row.fileSize, url: urlByPath.get(row.storagePath) ?? null })
    result.set(row.messageId!, list)
  }
  return result
}

/** 送られずに残った添付（アップロードしたまま送信しなかった・送信に失敗した）を回収する。Storage を消せた行だけ消す */
export async function cleanupUnsentAiAttachments(now = new Date()): Promise<{ removed: number; failed: number }> {
  const { aiAttachments, db } = await import('@cairn/db')
  const { and, inArray, isNull, lte } = await import('drizzle-orm')
  const rows = await db
    .select({ id: aiAttachments.id, storagePath: aiAttachments.storagePath })
    .from(aiAttachments)
    .where(and(isNull(aiAttachments.messageId), lte(aiAttachments.createdAt, new Date(now.getTime() - AI_ATTACHMENT_UNSENT_TTL_MS))))
    .limit(100)
  if (rows.length === 0) return { removed: 0, failed: 0 }
  const { error } = await createServiceRoleClient().storage.from(AI_ATTACHMENT_BUCKET).remove(rows.map((row) => row.storagePath))
  if (error) {
    console.error('[ai attachments] cleanup remove failed:', error)
    return { removed: 0, failed: rows.length }
  }
  await db.delete(aiAttachments).where(and(inArray(aiAttachments.id, rows.map((row) => row.id)), isNull(aiAttachments.messageId)))
  return { removed: rows.length, failed: 0 }
}
