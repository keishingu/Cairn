// Copyright 2026 Cairn Contributors
// SPDX-License-Identifier: Apache-2.0

import { z } from 'zod'
import { IMPORT_SOURCES, teamsConversationKind } from '@cairn/core/import'

/**
 * 取り込み API が受け付ける形。ブラウザで解析した結果を信用せず、件数・長さ・形式をすべて検証する。
 * 本文は Parser が HTML を取り除いた Markdown 用のテキストだが、サーバーでも HTML の混入を拒否する。
 */

export const MAX_BATCH_MESSAGES = 200
export const MAX_MESSAGE_TEXT = 50_000
export const MAX_IDENTITIES_PER_REQUEST = 2_000
export const MAX_CONVERSATIONS_PER_JOB = 100

const isoDate = z.string().max(40).refine(value => !Number.isNaN(Date.parse(value)), '日時の形式が不正です')
const externalId = z.string().min(1).max(200).regex(/^[\x21-\x7e]+$/, '外部 ID の形式が不正です')
const identityKey = z.string().min(1).max(300)

export const importSourceSchema = z.enum(IMPORT_SOURCES)

export const importIdentitySchema = z.object({
  key: identityKey,
  displayName: z.string().max(200).nullable(),
  anonymous: z.boolean(),
  kind: z.enum(['exporter', 'named', 'unnamed-participant', 'anonymous']),
}).refine(identity => identity.anonymous === (identity.kind === 'anonymous'), '投稿者不明の指定が種類と一致しません')

export const createImportJobSchema = z.object({
  source: importSourceSchema,
  exportedAt: isoDate.nullable(),
  conversations: z.array(z.object({
    externalId,
    channelId: z.string().uuid(),
    totalMessages: z.number().int().min(0).max(1_000_000),
  })).min(1).max(MAX_CONVERSATIONS_PER_JOB),
  identities: z.array(importIdentitySchema).max(MAX_IDENTITIES_PER_REQUEST),
  /** 管理者が確認した紐づけ（identity key → Cairn ユーザー ID） */
  links: z.array(z.object({ key: identityKey, userId: z.string().uuid() })).max(MAX_IDENTITIES_PER_REQUEST).default([]),
}).refine(
  // 1対1・会議チャットは相手との私的な会話なので、画面で選べないだけでなくサーバーでも拒否する
  input => input.conversations.every(c => teamsConversationKind(c.externalId) === 'group'),
  { message: '取り込めるのはグループの会話だけです（1対1チャット・会議チャットは取り込めません）', path: ['conversations'] },
)

// 本文の `<` は Parser が `\\<` にエスケープする。エスケープされていない `<` は自動リンク `<https://…>` だけを許し、
// HTML のタグや Cairn のメンション記法（`<@id>`、エスケープしても Markdown の描画後にメンションになる）は受け付けない。
// ブラウザ側の変換を信用せず、サーバーでも確かめる
const noHtml = (text: string) => {
  const rest = text.replace(/<https?:\/\/[^\s<>]+>/g, '')
  return !/(^|[^\\])</.test(rest) && !rest.includes('<@')
}

export const importMessageSchema = z.object({
  externalId: z.string().regex(/^\d{1,20}$/, 'メッセージ ID の形式が不正です'),
  identityKey,
  sentAt: isoDate,
  editedAt: isoDate.nullable(),
  text: z.string().max(MAX_MESSAGE_TEXT).refine(noHtml, '本文に HTML やメンション記法が含まれています'),
  quotedExternalId: z.string().regex(/^\d{1,20}$/).nullable(),
  reactions: z.array(z.object({
    identityKey,
    emoji: z.string().min(1).max(64),
    sourceKey: z.string().min(1).max(60),
    reactedAt: isoDate,
  })).max(1_000),
  mediaObjectIds: z.array(z.string().regex(/^[A-Za-z0-9-]{1,80}$/)).max(50),
  attributes: z.object({
    messageType: z.string().max(60),
    senderIdPresent: z.boolean(),
    senderNamePresent: z.boolean(),
    hasSubject: z.boolean(),
    isEventCard: z.boolean(),
    mentionCount: z.number().int().min(0).max(10_000),
  }),
})

export const importBatchSchema = z.object({
  conversationExternalId: externalId,
  messages: z.array(importMessageSchema).min(1).max(MAX_BATCH_MESSAGES),
})

export const mediaLookupSchema = z.object({
  channelId: z.string().uuid(),
  objectIds: z.array(z.string().regex(/^[A-Za-z0-9-]{1,80}$/)).min(1).max(1_000),
})

export const registerMediaSchema = z.object({
  objectId: z.string().regex(/^[A-Za-z0-9-]{1,80}$/),
  fileId: z.string().uuid(),
  channelId: z.string().uuid(),
})

const countRecord = z.record(z.string().max(60), z.number().int().min(0).max(10_000_000))

/** 取り込まれなかった情報のレポート。件数と理由だけで、本文・氏名は受け付けない */
export const completeImportJobSchema = z.object({
  status: z.enum(['completed', 'failed', 'cancelled']),
  report: z.object({
    conversations: z.array(z.object({
      externalId,
      counts: countRecord,
    })).max(MAX_CONVERSATIONS_PER_JOB),
    excludedConversations: countRecord,
    mediaFailures: z.array(z.object({
      objectId: z.string().regex(/^[A-Za-z0-9-]{1,80}$/),
      reason: z.enum(['missing-file', 'unsupported-type', 'too-large', 'upload-failed']),
    })).max(10_000),
  }),
  error: z.string().max(500).nullable().default(null),
})

export const linkIdentitySchema = z.object({
  userId: z.string().uuid().nullable(),
})

export type CreateImportJobInput = z.infer<typeof createImportJobSchema>
export type ImportBatchInput = z.infer<typeof importBatchSchema>
export type ImportMessageInput = z.infer<typeof importMessageSchema>
export type CompleteImportJobInput = z.infer<typeof completeImportJobSchema>
