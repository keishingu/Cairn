// Copyright 2026 Cairn Contributors
// SPDX-License-Identifier: Apache-2.0

import { parseLocalePreference, resolveLocale, type AppLocale } from '@cairn/shared'
import {
  extractAttributeMentionIds,
  extractMentionIds,
  extractRoleMentionIds,
  hasAllMention,
  hasProjectMembersMention,
  stripMentionsToText,
} from '@/lib/chat/mentions'
import type { MessageCreatedEvent } from './events'

export type Recipient = { userId: string; displayName: string }

/**
 * on-message-created が書き込む前に決める宛先と本文。読み取りだけで作るため、1つの step にまとめて実行する
 * （Inngest は step ごとに実行数を数える。読み取りは再実行しても結果が変わらないので、細かく分ける利点が小さい）。
 */
export type MessageNotificationPlan =
  | { kind: 'dm'; channelId: string; members: Recipient[]; body: string }
  | {
      kind: 'channel'
      channelId: string
      /** 添付通知の宛先（送信者を除くチャンネルの活性メンバーから、ブロック関係を除いたもの） */
      members: Recipient[]
      /** メンション・返信の通知の宛先（アクセスとブロックで絞り込み済み） */
      mentionRecipients: Recipient[]
      /** 明示的にメンションされた人。返信だけの宛先とは通知の文言を変える */
      explicitlyMentionedIds: string[]
      mentionBody: string
      recipientLocales: Record<string, AppLocale>
    }

export type PlanReaders = {
  readMessageChannel: (messageId: string, fallbackChannelId: string) => Promise<string>
  fetchChannelMembers: (workspaceId: string, channelId: string, senderId: string) => Promise<Recipient[]>
  filterUnblocked: (senderId: string, recipients: Recipient[]) => Promise<Recipient[]>
  readChannelType: (channelId: string) => Promise<string | null>
  fetchReplyTargets: (workspaceId: string, messageId: string, senderId: string) => Promise<Recipient[]>
  fetchMentionedMembers: (workspaceId: string, userIds: string[], senderId: string) => Promise<Recipient[]>
  expandAllMention: (workspaceId: string, senderId: string) => Promise<Recipient[]>
  expandProjectMembersMention: (workspaceId: string, channelId: string, senderId: string) => Promise<Recipient[]>
  expandAttributeMentions: (workspaceId: string, attributeIds: string[], senderId: string) => Promise<Recipient[]>
  expandRoleMentions: (workspaceId: string, channelId: string, roleIds: string[], senderId: string) => Promise<Recipient[]>
  buildMentionNameMap: (workspaceId: string, content: string) => Promise<Map<string, string>>
  filterMentionAccess: (workspaceId: string, channelId: string, recipients: Recipient[]) => Promise<Recipient[]>
  resolveRecipientLocales: (userIds: string[]) => Promise<Record<string, AppLocale>>
}

export async function planMessageNotifications(
  data: MessageCreatedEvent['data'],
  readers: PlanReaders = dbPlanReaders,
): Promise<MessageNotificationPlan> {
  const { messageId, channelId: postedChannelId, workspaceId, senderId, content } = data

  // スレッドへの切り出しで、このジョブが走る前にメッセージが移動していることがある。
  // 投稿時のチャンネルのまま通知を作ると遷移先とメンション未読数が親に残るため、今のチャンネルを読み直す。
  const channelId = await readers.readMessageChannel(messageId, postedChannelId)
  const members = await readers.filterUnblocked(
    senderId,
    await readers.fetchChannelMembers(workspaceId, channelId, senderId),
  )

  if ((await readers.readChannelType(channelId)) === 'dm') {
    const names = new Map(members.map((m) => [m.userId, m.displayName]))
    return { kind: 'dm', channelId, members, body: stripMentionsToText(content, (id) => names.get(id)) }
  }

  // @メンション通知（個別・@all・@project_members・属性・役割）。チャンネル未参加でも到達可能な人へ通知する。
  const mentionedIds = extractMentionIds(content)
  const attributeMentionIds = extractAttributeMentionIds(content)
  const roleMentionIds = extractRoleMentionIds(content)

  // 返信は、メンションがなくても返信元の投稿者に届ける（Slack のスレッド返信と同じ期待に合わせる）。
  // 宛先の絞り込み（チャンネルへのアクセス・ブロック）はメンションと同じ経路に乗せる。
  const replyTargets = await readers.fetchReplyTargets(workspaceId, messageId, senderId)

  const { mergeMentionMembers } = await import('@/lib/chat/mention-expand')
  const explicitlyMentioned = mergeMentionMembers(
    mentionedIds.length > 0 ? await readers.fetchMentionedMembers(workspaceId, mentionedIds, senderId) : [],
    hasAllMention(content) ? await readers.expandAllMention(workspaceId, senderId) : [],
    hasProjectMembersMention(content) ? await readers.expandProjectMembersMention(workspaceId, channelId, senderId) : [],
    attributeMentionIds.length > 0 ? await readers.expandAttributeMentions(workspaceId, attributeMentionIds, senderId) : [],
    roleMentionIds.length > 0 ? await readers.expandRoleMentions(workspaceId, channelId, roleMentionIds, senderId) : [],
  )
  const candidates = mergeMentionMembers(replyTargets, explicitlyMentioned)

  // アクセスできないチャンネルへメンション通知が飛ぶのを防ぐ（requireChannelAccess と同じスコープ。guest / private 含む）
  const mentionRecipients = candidates.length > 0
    ? await readers.filterUnblocked(senderId, await readers.filterMentionAccess(workspaceId, channelId, candidates))
    : []

  if (mentionRecipients.length === 0) {
    return { kind: 'channel', channelId, members, mentionRecipients, explicitlyMentionedIds: [], mentionBody: '', recipientLocales: {} }
  }

  // 本文プレビューのメンションは送信時点の最新名で解決する
  const nameMap = await readers.buildMentionNameMap(workspaceId, content)
  for (const member of [...members, ...candidates]) {
    if (!nameMap.has(member.userId)) nameMap.set(member.userId, member.displayName)
  }

  return {
    kind: 'channel',
    channelId,
    members,
    mentionRecipients,
    explicitlyMentionedIds: explicitlyMentioned.map((m) => m.userId),
    mentionBody: stripMentionsToText(content, (id) => nameMap.get(id)),
    recipientLocales: await readers.resolveRecipientLocales(mentionRecipients.map((m) => m.userId)),
  }
}

/** メッセージの今のチャンネル。見つからなければ投稿時のチャンネルを使う */
export async function readMessageChannel(messageId: string, fallbackChannelId: string): Promise<string> {
  const { db, messages } = await import('@cairn/db')
  const { eq } = await import('drizzle-orm')
  const [row] = await db
    .select({ channelId: messages.channelId })
    .from(messages)
    .where(eq(messages.id, messageId))
    .limit(1)
  return row?.channelId ?? fallbackChannelId
}

// 猶予期間中に対象メッセージを既読にした受信者と未読の受信者を分ける。
// 猶予中にメッセージが削除された場合は、どちらにも含めない。
export async function classifyPushRecipients<T extends { userId: string }>(
  messageId: string,
  channelId: string,
  recipients: T[],
): Promise<{ readRecipients: T[]; unreadRecipients: T[] }> {
  if (recipients.length === 0) return { readRecipients: [], unreadRecipients: [] }

  const { db, messages, channelReadStates } = await import('@cairn/db')
  const { eq, and, inArray, or, sql } = await import('drizzle-orm')

  const [msg] = await db
    .select({ deletedAt: messages.deletedAt })
    .from(messages)
    .where(eq(messages.id, messageId))
    .limit(1)

  // 猶予中に削除されたメッセージの Push は送らない
  if (!msg || msg.deletedAt) return { readRecipients: [], unreadRecipients: [] }

  const readStates = await db
    .select({ userId: channelReadStates.userId })
    .from(channelReadStates)
    .where(
      and(
        eq(channelReadStates.channelId, channelId),
        inArray(
          channelReadStates.userId,
          recipients.map((r) => r.userId),
        ),
        or(
          eq(channelReadStates.lastReadMessageId, messageId),
          sql`${channelReadStates.lastReadAt} >= (
            select ${messages.createdAt}
            from ${messages}
            where ${messages.id} = ${messageId}
          )`,
        ),
      ),
    )

  const readUserIds = new Set(readStates.map((state) => state.userId))
  return {
    readRecipients: recipients.filter((recipient) => readUserIds.has(recipient.userId)),
    unreadRecipients: recipients.filter((recipient) => !readUserIds.has(recipient.userId)),
  }
}

async function readChannelProjectId(channelId: string): Promise<string | null | undefined> {
  const { db, channels } = await import('@cairn/db')
  const { eq } = await import('drizzle-orm')
  const [ch] = await db.select({ projectId: channels.projectId }).from(channels).where(eq(channels.id, channelId)).limit(1)
  return ch?.projectId
}

export const dbPlanReaders: PlanReaders = {
  readMessageChannel,

  // 非活性メンバーは DM・ファイル通知の宛先にしないよう active_workspace_members に inner join して active のみに絞る
  // （deactivation は履歴のため channel_members 行を残すため、ここで除外しないと通知が飛ぶ）
  async fetchChannelMembers(workspaceId, channelId, senderId) {
    const { db, channelMembers, profiles, activeWorkspaceMembers } = await import('@cairn/db')
    const { eq, and } = await import('drizzle-orm')
    const rows = await db
      .select({ userId: channelMembers.userId, displayName: profiles.displayName })
      .from(channelMembers)
      .innerJoin(profiles, eq(channelMembers.userId, profiles.id))
      .innerJoin(
        activeWorkspaceMembers,
        and(
          eq(activeWorkspaceMembers.userId, channelMembers.userId),
          eq(activeWorkspaceMembers.workspaceId, workspaceId),
        ),
      )
      .where(eq(channelMembers.channelId, channelId))
    return rows.filter((r) => r.userId !== senderId)
  },

  async filterUnblocked(senderId, recipients) {
    if (recipients.length === 0) return []
    const { filterUnblockedRecipients } = await import('@/lib/safety/blocks')
    const ids = await filterUnblockedRecipients(senderId, recipients.map((r) => r.userId))
    return recipients.filter((r) => ids.includes(r.userId))
  },

  async readChannelType(channelId) {
    const { db, channels } = await import('@cairn/db')
    const { eq } = await import('drizzle-orm')
    const [ch] = await db.select({ type: channels.type }).from(channels).where(eq(channels.id, channelId)).limit(1)
    return ch?.type ?? null
  },

  async fetchReplyTargets(workspaceId, messageId, senderId) {
    const { db, messages, profiles } = await import('@cairn/db')
    const { eq, and, ne, isNull } = await import('drizzle-orm')
    const { alias } = await import('drizzle-orm/pg-core')
    const { filterActiveMemberIds } = await import('@/lib/access/membership')
    const parent = alias(messages, 'parent_message')
    const authors = await db
      .select({ userId: parent.senderId, displayName: profiles.displayName })
      .from(messages)
      .innerJoin(parent, and(eq(parent.id, messages.parentMessageId), isNull(parent.deletedAt)))
      .innerJoin(profiles, eq(profiles.id, parent.senderId))
      .where(and(eq(messages.id, messageId), ne(parent.senderId, senderId)))
      .limit(1)
    // 非活性メンバーは未所属と同等に扱うため、宛先の判定は共有の membership 経由で行う
    const activeIds = await filterActiveMemberIds(workspaceId, authors.map((a) => a.userId))
    return authors.filter((a) => activeIds.has(a.userId))
  },

  // 非活性メンバーにはメンション通知を送らない（active membership のみ宛先にする）
  async fetchMentionedMembers(workspaceId, userIds, senderId) {
    const { db, activeWorkspaceMembers, profiles } = await import('@cairn/db')
    const { eq, inArray, and, ne } = await import('drizzle-orm')
    return db
      .select({ userId: activeWorkspaceMembers.userId, displayName: profiles.displayName })
      .from(activeWorkspaceMembers)
      .innerJoin(profiles, eq(activeWorkspaceMembers.userId, profiles.id))
      .where(
        and(
          eq(activeWorkspaceMembers.workspaceId, workspaceId),
          inArray(activeWorkspaceMembers.userId, userIds),
          ne(activeWorkspaceMembers.userId, senderId),
        ),
      )
  },

  async expandAllMention(workspaceId, senderId) {
    const { listActiveWorkspaceMembersExcept } = await import('@/lib/chat/mention-expand')
    return listActiveWorkspaceMembersExcept(workspaceId, senderId)
  },

  async expandProjectMembersMention(workspaceId, channelId, senderId) {
    const { listActiveProjectMembersExcept } = await import('@/lib/chat/mention-expand')
    return listActiveProjectMembersExcept(workspaceId, await readChannelProjectId(channelId), senderId)
  },

  async expandAttributeMentions(workspaceId, attributeIds, senderId) {
    const { listActiveMembersByAttributeIds } = await import('@/lib/chat/mention-expand')
    return listActiveMembersByAttributeIds(workspaceId, attributeIds, senderId)
  },

  async expandRoleMentions(workspaceId, channelId, roleIds, senderId) {
    const { listActiveProjectMembersByRoleIds } = await import('@/lib/chat/mention-expand')
    return listActiveProjectMembersByRoleIds(workspaceId, await readChannelProjectId(channelId), roleIds, senderId)
  },

  async buildMentionNameMap(workspaceId, content) {
    const { buildMentionNameMap } = await import('@/lib/chat/mention-name-map')
    return buildMentionNameMap(workspaceId, [content])
  },

  async filterMentionAccess(workspaceId, channelId, recipients) {
    const { db, channels, channelMembers, projectMembers, activeWorkspaceMembers } = await import('@cairn/db')
    const { eq, and, inArray } = await import('drizzle-orm')
    const { filterMentionRecipients } = await import('@/lib/chat/mention-access')
    const ids = recipients.map((m) => m.userId)

    const [ch] = await db
      .select({ type: channels.type, projectId: channels.projectId, isPrivate: channels.isPrivate })
      .from(channels)
      .where(eq(channels.id, channelId))
      .limit(1)
    if (!ch) return []

    const needsChannelMembers = ch.isPrivate || ch.type === 'dm' || ch.type === 'workspace'
    const channelMemberIds = needsChannelMembers
      ? new Set(
          (
            await db
              .select({ userId: channelMembers.userId })
              .from(channelMembers)
              .where(and(eq(channelMembers.channelId, channelId), inArray(channelMembers.userId, ids)))
          ).map((r) => r.userId),
        )
      : new Set<string>()

    const guestIds = new Set(
      (
        await db
          .select({ userId: activeWorkspaceMembers.userId })
          .from(activeWorkspaceMembers)
          .where(
            and(
              eq(activeWorkspaceMembers.workspaceId, workspaceId),
              inArray(activeWorkspaceMembers.userId, ids),
              eq(activeWorkspaceMembers.role, 'guest'),
            ),
          )
      ).map((r) => r.userId),
    )

    const projectMemberIds =
      guestIds.size > 0 && ch.type === 'project' && ch.projectId
        ? new Set(
            (
              await db
                .select({ userId: projectMembers.userId })
                .from(projectMembers)
                .where(and(eq(projectMembers.projectId, ch.projectId), inArray(projectMembers.userId, [...guestIds])))
            ).map((r) => r.userId),
          )
        : new Set<string>()

    return filterMentionRecipients({ channel: ch, recipients, channelMemberIds, guestIds, projectMemberIds })
  },

  // 'system' の受信者はジョブに Accept-Language が無いため、Web と同じ既定言語で解決する
  async resolveRecipientLocales(userIds) {
    const { db, profiles } = await import('@cairn/db')
    const { inArray } = await import('drizzle-orm')
    const rows = await db.select({ id: profiles.id, locale: profiles.locale }).from(profiles).where(inArray(profiles.id, userIds))
    return Object.fromEntries(rows.map((row) => [row.id, resolveLocale(parseLocalePreference(row.locale), null)]))
  },
}
