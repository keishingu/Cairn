// Copyright 2026 Cairn Contributors
// SPDX-License-Identifier: Apache-2.0

// 指示文の中の参照（docs/ai-automation-design.md §4）。入力補完で ID に固定して保存し、表示・実行のたびに名前へ解決する。
// - メンバー `<@userId>`・属性 `<@attr:id>`・プロジェクトの役割 `<@role:id>` はチャットのメンションと同じ形
// - チャンネル `<#channelId>` は指示文だけで使う
// 名前は読む人の権限で解決する。見えないチャンネルの名前は出さない（一覧はメンバー全員が見るため）

import type { AuthContext } from '@/lib/get-auth-context'
import { buildMentionNameMap } from '@/lib/chat/mention-name-map'
import { hydrateMentions } from '@/lib/chat/mentions'
import { canAccessChannel } from '@/lib/permissions'

const CHANNEL_REFERENCE_SOURCE = '<#([0-9a-f-]{36})(?:\\|[^>\\n]*)?>'

export const HIDDEN_CHANNEL_NAME = '非公開のチャンネル'

export function extractChannelReferenceIds(text: string): string[] {
  return [...new Set([...text.matchAll(new RegExp(CHANNEL_REFERENCE_SOURCE, 'gi'))].map((match) => match[1]!))]
}

async function channelNames(ctx: AuthContext, ids: string[]): Promise<Map<string, string>> {
  const names = new Map<string, string>()
  if (ids.length === 0) return names
  const { channels, db, milestones, projects } = await import('@cairn/db')
  const { inArray, eq, sql } = await import('drizzle-orm')
  const rows = await db
    .select({
      id: channels.id,
      type: channels.type,
      name: sql<string>`case when ${channels.parentChannelId} is not null then coalesce(${channels.name}, '名称なし')
        else coalesce(${milestones.title}, ${projects.title}, ${channels.name}, '名称なし') end`,
    })
    .from(channels)
    .leftJoin(projects, eq(channels.projectId, projects.id))
    .leftJoin(milestones, eq(channels.milestoneId, milestones.id))
    .where(inArray(channels.id, ids))
  for (const row of rows) {
    if (row.type === 'dm') continue
    if (await canAccessChannel(ctx.workspaceId, ctx.userId, row.id, ctx.role)) names.set(row.id, row.name)
  }
  return names
}

const REFERENCE_NAME_MAX_LENGTH = 60

/**
 * 参照に埋め込む名前を、記法を壊せない形にする。表示名・チャンネル名はメンバーが自由に付けられるため、
 * `<` `>` `|` や改行を含む名前で参照を閉じて、admin の指示文としてプロンプトに指示を書き足せないようにする
 */
export function sanitizeReferenceName(name: string): string {
  return name.replace(/[<>|\r\n\t]/g, ' ').replace(/\s+/g, ' ').trim().slice(0, REFERENCE_NAME_MAX_LENGTH)
}

/** 指示文の参照を `<@id|名前>`・`<#id|名前>` に解決する（読む人に見えないチャンネルは名前を伏せる） */
export async function hydrateInstructionReferences(ctx: AuthContext, texts: string[]): Promise<string[]> {
  const mentionNames = await buildMentionNameMap(ctx.workspaceId, texts)
  const channels = await channelNames(ctx, [...new Set(texts.flatMap(extractChannelReferenceIds))])
  return texts.map((text) =>
    hydrateMentions(text, (id) => {
      const name = mentionNames.get(id)
      return name === undefined ? undefined : sanitizeReferenceName(name)
    }).replace(
      new RegExp(CHANNEL_REFERENCE_SOURCE, 'gi'),
      (_full, id: string) => {
        const name = channels.get(id)
        return `<#${id}|${name === undefined ? HIDDEN_CHANNEL_NAME : sanitizeReferenceName(name)}>`
      },
    ),
  )
}

/** 保存前に、表示用に埋め込まれた名前を落として ID だけの形にそろえる */
export function canonicalizeInstructionReferences(text: string): string {
  return text
    .replace(/<@([^|>\s]+)\|[^>\n]*>/g, '<@$1>')
    .replace(new RegExp(CHANNEL_REFERENCE_SOURCE, 'gi'), '<#$1>')
}
