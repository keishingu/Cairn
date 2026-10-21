// Copyright 2026 Cairn Contributors
// SPDX-License-Identifier: Apache-2.0

import { BLOCKS_SCHEMA_VERSION, prepareMessageBlocks, type MessageBlock } from '@cairn/shared'
import type { MessageCreatedEvent } from '@/lib/inngest/events'
import { inngest } from '@/lib/inngest/client'
import { canonicalizeMentions } from '@/lib/chat/mentions'
import { unsafeMessageError } from '@/lib/safety/message-filter'
import type { BotContext } from '../bot-tokens'
import { resolveBotChannel } from './channel-access'
import { fail, isUuid, stringArg, type WebApiArgs, type WebApiResult } from './types'

// Slack の chat.postMessage と同じ上限
const MAX_TEXT_LENGTH = 40000

type ParsedBlocks = { ok: true; blocks: MessageBlock[] | undefined } | { ok: false; result: WebApiResult }

/** form-urlencoded では blocks が JSON 文字列で来る（Bolt の既定）。JSON の本文なら配列のまま来る */
function parseBlocksArg(args: WebApiArgs): ParsedBlocks {
  const raw = args['blocks']
  if (raw === undefined || raw === '') return { ok: true, blocks: undefined }
  let value: unknown = raw
  if (typeof raw === 'string') {
    try {
      value = JSON.parse(raw)
    } catch {
      return { ok: false, result: fail('invalid_blocks_format') }
    }
  }
  const prepared = prepareMessageBlocks(value)
  if (!prepared.ok) return { ok: false, result: fail('invalid_blocks', { response_metadata: { messages: prepared.errors } }) }
  // カードに見える文字も、人の投稿・text と同じ安全フィルタにかける（blocks だけの投稿で抜け道にさせない）
  const unsafe = unsafeMessageError(visibleTextOfBlocks(prepared.value))
  if (unsafe) return { ok: false, result: fail('invalid_blocks', { response_metadata: { messages: [unsafe] } }) }
  return { ok: true, blocks: prepared.value }
}

/** 安全フィルタにかける、カードに見えるすべての文字（見出し・本文・フィールド・補足・ボタン・選択肢・確認ダイアログ・画像の代替文） */
export function visibleTextOfBlocks(blocks: MessageBlock[]): string {
  const texts: string[] = []
  const walk = (node: unknown) => {
    if (Array.isArray(node)) return node.forEach(walk)
    if (typeof node !== 'object' || node === null) return
    const record = node as Record<string, unknown>
    if ((record['type'] === 'plain_text' || record['type'] === 'mrkdwn') && typeof record['text'] === 'string') texts.push(record['text'])
    if (typeof record['alt_text'] === 'string') texts.push(record['alt_text'])
    for (const [key, value] of Object.entries(record)) {
      // 値・ID・URL は表示されない（URL ボタンの遷移先は表示文と別に扱う）
      if (key !== 'text' && key !== 'value' && key !== 'action_id' && key !== 'block_id' && key !== 'url' && key !== 'image_url') walk(value)
      else if (key === 'text' && typeof value === 'object') walk(value)
    }
  }
  walk(blocks)
  return texts.join('\n')
}

type ParsedText = { ok: true; text: string | undefined } | { ok: false; result: WebApiResult }

function parseTextArg(args: WebApiArgs): ParsedText {
  const text = stringArg(args, 'text')
  if (text === undefined) return { ok: true, text: undefined }
  if (text.length > MAX_TEXT_LENGTH) return { ok: false, result: fail('msg_too_long') }
  // 人の投稿と同じ安全フィルタにかける。メンションは名前なしの canonical 形式で保存する
  const canonical = canonicalizeMentions(text)
  const unsafe = unsafeMessageError(canonical)
  if (unsafe) return { ok: false, result: fail('invalid_arguments', { response_metadata: { messages: [unsafe] } }) }
  return { ok: true, text: canonical }
}

/**
 * text を省いた blocks のメッセージの代替テキスト（通知・検索・何も描けないクライアント用）。
 * Slack は text を省くと警告を返すだけなので受け付けるが、Cairn は messages.content を空にしないよう blocks から組み立てる
 */
export function fallbackTextFromBlocks(blocks: MessageBlock[]): string {
  const lines: string[] = []
  for (const block of blocks) {
    if (block.type === 'header') lines.push(block.text.text)
    if (block.type === 'section') {
      if (block.text) lines.push(block.text.text)
      for (const field of block.fields ?? []) lines.push(field.text)
    }
    if (block.type === 'context') {
      for (const element of block.elements) if (element.type !== 'image') lines.push(element.text)
    }
    // 単独の画像はカードの中身なので代替テキストを使う（補足やアクセサリの画像はアイコン等の飾りなので含めない）
    if (block.type === 'image') lines.push(block.title?.text ?? block.alt_text)
  }
  return lines.join('\n').slice(0, MAX_TEXT_LENGTH)
}

function messageResult(input: { id: string; channelId: string; text: string; bot: BotContext; blocks: MessageBlock[] | undefined }) {
  return {
    ok: true as const,
    channel: input.channelId,
    ts: input.id,
    message: {
      type: 'message',
      text: input.text,
      user: input.bot.botProfileId,
      bot_id: input.bot.installationId,
      app_id: input.bot.appId,
      ts: input.id,
      ...(input.blocks ? { blocks: input.blocks } : {}),
    },
    cairn: { message_id: input.id },
  }
}

export async function chatPostMessage(bot: BotContext, args: WebApiArgs): Promise<WebApiResult> {
  // Cairn のスレッドは別チャンネルで、Slack の thread_ts（同じチャンネル内の返信）に当たるものがない。黙って無視せずに断る
  if (args['thread_ts'] !== undefined) {
    return fail('invalid_arguments', { response_metadata: { messages: ['thread_ts は未対応です。スレッドのチャンネルを channel に指定してください'] } })
  }
  const clientMsgId = stringArg(args, 'client_msg_id')
  if (clientMsgId !== undefined && !isUuid(clientMsgId)) {
    return fail('invalid_arguments', { response_metadata: { messages: ['client_msg_id は UUID で指定してください'] } })
  }

  const { db, messages, messageBlocks, channels, apps } = await import('@cairn/db')
  const { and, eq, sql } = await import('drizzle-orm')

  // すでに投稿済みの再送は、チャンネルの確認より先に既存のメッセージを返す。投稿の後にチャンネルがアーカイブされた・
  // Bot が外されたときも、再試行が「投稿できなかった」と誤って終わらず、投稿済みのメッセージに収束する
  const requestedChannel = stringArg(args, 'channel')
  if (clientMsgId && isUuid(requestedChannel)) {
    const [posted] = await db
      .select({ id: messages.id, channelId: messages.channelId, content: messages.content, blocks: messageBlocks.blocks })
      .from(messages)
      .leftJoin(messageBlocks, eq(messageBlocks.messageId, messages.id))
      .where(and(eq(messages.id, clientMsgId), eq(messages.channelId, requestedChannel), eq(messages.senderId, bot.botProfileId)))
      .limit(1)
    if (posted) return messageResult({ id: posted.id, channelId: posted.channelId, text: posted.content, bot, blocks: (posted.blocks as MessageBlock[] | null) ?? undefined })
  }

  const access = await resolveBotChannel(bot, requestedChannel)
  if (!access.ok) return fail(access.error)
  const blocks = parseBlocksArg(args)
  if (!blocks.ok) return blocks.result
  const text = parseTextArg(args)
  if (!text.ok) return text.result
  if (text.text === undefined && blocks.blocks === undefined) return fail('no_text')
  const content = text.text ?? fallbackTextFromBlocks(blocks.blocks!)
  // ボタンや区切り線だけのカードは代替テキストを組み立てられない。通知・検索・引用で空のメッセージにしない
  if (content === '') return fail('no_text', { response_metadata: { messages: ['カードに文字が無いため、text に代替テキストを指定してください'] } })

  // 同じ client_msg_id の再送は新しく投稿せず既存のメッセージを返す（再試行が同じメッセージに収束する。§7.4）
  const findExisting = async (executor: Pick<typeof db, 'select'>): Promise<WebApiResult | null> => {
    if (!clientMsgId) return null
    const [existing] = await executor
      .select({ id: messages.id, channelId: messages.channelId, senderId: messages.senderId, content: messages.content, blocks: messageBlocks.blocks })
      .from(messages)
      .leftJoin(messageBlocks, eq(messageBlocks.messageId, messages.id))
      .where(eq(messages.id, clientMsgId))
      .limit(1)
    if (!existing) return null
    if (existing.channelId !== access.channel.id || existing.senderId !== bot.botProfileId) return fail('client_msg_id_conflict')
    return messageResult({ id: existing.id, channelId: existing.channelId, text: existing.content, bot, blocks: (existing.blocks as MessageBlock[] | null) ?? undefined })
  }
  const existingBeforeLock = await findExisting(db)
  if (existingBeforeLock) return existingBeforeLock

  const inserted = await db.transaction(async (tx) => {
    // 既読スナップショットと投稿順をチャンネル単位で直列化する（人の投稿と同じ）
    await tx.select({ id: channels.id }).from(channels).where(eq(channels.id, access.channel.id)).for('update')
    // 元の要求がまだ処理中に再送が重なると、どちらも上の確認を通る。ロックを取った後にもう一度確かめ、同じ ID の insert で失敗させない
    const existing = await findExisting(tx)
    if (existing) return { existing }
    const [message] = await tx
      .insert(messages)
      .values({
        ...(clientMsgId ? { id: clientMsgId } : {}),
        channelId: access.channel.id,
        senderId: bot.botProfileId,
        content,
        messageType: blocks.blocks ? 'blocks' : 'text',
        createdAt: sql`clock_timestamp()`,
        updatedAt: sql`clock_timestamp()`,
      })
      .returning({ id: messages.id })
    if (!message) throw new Error('Insert returned no rows')
    if (blocks.blocks) {
      await tx.insert(messageBlocks).values({
        messageId: message.id,
        installationId: bot.installationId,
        blocks: blocks.blocks,
        schemaVersion: BLOCKS_SCHEMA_VERSION,
      })
    }
    return { message }
  })
  if ('existing' in inserted) return inserted.existing
  const message = inserted.message

  const [app] = await db.select({ name: apps.name }).from(apps).where(eq(apps.id, bot.appId)).limit(1)
  // メンション通知・Push・AI インデックスは人の投稿と同じく on-message-created に任せる
  inngest
    .send({
      name: 'message/created',
      data: {
        messageId: message.id,
        channelId: access.channel.id,
        workspaceId: bot.workspaceId,
        senderId: bot.botProfileId,
        senderName: app?.name ?? '',
        content,
        attachmentFileIds: [],
      },
    } satisfies MessageCreatedEvent)
    .catch((err: unknown) => {
      console.warn('[inngest] message/created send failed (Inngest not running?):', err)
    })

  return messageResult({ id: message.id, channelId: access.channel.id, text: content, bot, blocks: blocks.blocks })
}

type OwnMessage = { ok: true; id: string; channelId: string; content: string; messageType: string } | { ok: false; result: WebApiResult }

/** 更新・削除できるのは、同じインストールの Bot が投稿した未削除のメッセージだけ */
async function resolveOwnMessage(bot: BotContext, args: WebApiArgs): Promise<OwnMessage> {
  const access = await resolveBotChannel(bot, stringArg(args, 'channel'))
  if (!access.ok) return { ok: false, result: fail(access.error) }
  const ts = stringArg(args, 'ts')
  if (!isUuid(ts)) return { ok: false, result: fail('message_not_found') }

  const { db, messages } = await import('@cairn/db')
  const { and, eq, isNull } = await import('drizzle-orm')
  const [message] = await db
    .select({ id: messages.id, senderId: messages.senderId, content: messages.content, messageType: messages.messageType })
    .from(messages)
    .where(and(eq(messages.id, ts), eq(messages.channelId, access.channel.id), isNull(messages.deletedAt)))
    .limit(1)
  if (!message) return { ok: false, result: fail('message_not_found') }
  if (message.senderId !== bot.botProfileId) return { ok: false, result: fail('cant_update_message') }
  return { ok: true, id: message.id, channelId: access.channel.id, content: message.content, messageType: message.messageType }
}

export async function chatUpdate(bot: BotContext, args: WebApiArgs): Promise<WebApiResult> {
  const own = await resolveOwnMessage(bot, args)
  if (!own.ok) return own.result
  const blocks = parseBlocksArg(args)
  if (!blocks.ok) return blocks.result
  const text = parseTextArg(args)
  if (!text.ok) return text.result
  if (text.text === undefined && blocks.blocks === undefined) return fail('no_text')

  const { db, messages, messageBlocks } = await import('@cairn/db')
  const { eq, sql } = await import('drizzle-orm')
  // text を省いた更新では代替テキストを書き換えない（アプリが投稿時に書いた通知・検索用の文を、blocks から組み立てた文で上書きしない）
  const content = text.text ?? own.content
  // Slack と同じく、text だけの更新はカードを外して通常のメッセージにする（古いカードが残ったまま成功を返さない）
  const dropBlocks = blocks.blocks === undefined && own.messageType === 'blocks'
  const nextType = blocks.blocks ? ('blocks' as const) : dropBlocks ? ('text' as const) : undefined

  await db.transaction(async (tx) => {
    // messages.updated_at は動かさない。現行の「編集済み」は updated_at > created_at で決まり、票が入るたびに付いてしまうため（§4.1）
    if (content !== own.content || (nextType && nextType !== own.messageType)) {
      await tx
        .update(messages)
        .set({ content, ...(nextType ? { messageType: nextType } : {}) })
        .where(eq(messages.id, own.id))
    }
    if (dropBlocks) await tx.delete(messageBlocks).where(eq(messageBlocks.messageId, own.id))
    if (blocks.blocks) {
      await tx
        .insert(messageBlocks)
        .values({ messageId: own.id, installationId: bot.installationId, blocks: blocks.blocks, schemaVersion: BLOCKS_SCHEMA_VERSION })
        .onConflictDoUpdate({
          target: messageBlocks.messageId,
          set: { blocks: blocks.blocks, schemaVersion: BLOCKS_SCHEMA_VERSION, updatedAt: sql`clock_timestamp()` },
        })
    }
  })

  return { ok: true, channel: own.channelId, ts: own.id, text: content, cairn: { message_id: own.id } }
}

export async function chatDelete(bot: BotContext, args: WebApiArgs): Promise<WebApiResult> {
  const own = await resolveOwnMessage(bot, args)
  if (!own.ok) return own.result.error === 'cant_update_message' ? fail('cant_delete_message') : own.result

  const { db, messages, tasks } = await import('@cairn/db')
  const { eq } = await import('drizzle-orm')
  // 人の削除と同じく、ソフトデリートとそのメッセージ由来のタスクの削除を1トランザクションにする
  await db.transaction(async (tx) => {
    await tx.update(messages).set({ deletedAt: new Date() }).where(eq(messages.id, own.id))
    await tx.delete(tasks).where(eq(tasks.sourceMessageId, own.id))
  })
  return { ok: true, channel: own.channelId, ts: own.id }
}
