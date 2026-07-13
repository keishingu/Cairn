// Copyright 2026 Cairn Contributors
// SPDX-License-Identifier: Apache-2.0

import { generateObject } from 'ai'
import { z } from 'zod'
import type {
  ScheduledJobActionSpec,
  ScheduledJobMention,
  ScheduledJobMonthlySchedule,
} from '@cairn/db'
import { FAST_MODEL, openai } from '@/lib/ai/client'
import { computeNextRunAt, formatPreviewDate } from './schedule'

const compiledInstructionSchema = z.object({
  channelName: z.string().min(1),
  mentionNames: z.array(z.string().min(1)).default([]),
  schedule: z.object({
    type: z.literal('monthly'),
    dayOfMonth: z.number().int().min(1).max(31),
    hour: z.number().int().min(0).max(23),
    minute: z.number().int().min(0).max(59),
  }),
  actionSpec: z.object({
    type: z.literal('poll'),
    prompt: z.string().min(1),
    choicesPrompt: z.string().min(1),
    allowMultiple: z.boolean().default(false),
    anonymous: z.boolean().default(false),
  }),
})

export interface CompileContext {
  channelCandidates: Array<{ id: string, name: string }>
  memberCandidates: Array<{ id: string, displayName: string }>
  now?: Date
}

export interface CompiledScheduledJob {
  channelId: string
  schedule: ScheduledJobMonthlySchedule
  actionSpec: ScheduledJobActionSpec
  mentionUserIds: string[]
  mentions: ScheduledJobMention[]
  nextRunAt: Date
  preview: string
}

export class ScheduledJobCompileError extends Error {}

function resolveChannelId(name: string, candidates: Array<{ id: string, name: string }>) {
  const normalized = name.trim().replace(/^#/, '')
  const matches = candidates.filter(candidate => candidate.name === normalized)
  if (matches.length === 0) {
    throw new ScheduledJobCompileError(`\`#${normalized}\` というチャンネルが見つかりません`)
  }
  if (matches.length > 1) {
    throw new ScheduledJobCompileError(`\`#${normalized}\` に一致するチャンネルが複数あります`)
  }
  const match = matches[0]
  if (!match) {
    throw new ScheduledJobCompileError(`\`#${normalized}\` というチャンネルが見つかりません`)
  }
  return match.id
}

function resolveMentions(names: string[], candidates: Array<{ id: string, displayName: string }>) {
  const mentions: ScheduledJobMention[] = []
  for (const rawName of names) {
    const normalized = rawName.trim().replace(/^@/, '')
    const matches = candidates.filter(candidate => candidate.displayName === normalized)
    if (matches.length === 0) {
      throw new ScheduledJobCompileError(`\`@${normalized}\` というメンバーが見つかりません`)
    }
    if (matches.length > 1) {
      throw new ScheduledJobCompileError(`\`@${normalized}\` に一致するメンバーが${matches.length}人います`)
    }
    const match = matches[0]
    if (!match) {
      throw new ScheduledJobCompileError(`\`@${normalized}\` というメンバーが見つかりません`)
    }
    mentions.push({ userId: match.id, displayName: match.displayName })
  }
  return mentions
}

export async function compileScheduledJobInstruction(
  rawInstruction: string,
  { channelCandidates, memberCandidates, now = new Date() }: CompileContext,
): Promise<CompiledScheduledJob> {
  const { object } = await generateObject({
    model: openai(FAST_MODEL),
    schema: compiledInstructionSchema,
    prompt: [
      '次の日本語 instruction を、Cairn の定期ジョブ保存用 JSON に変換してください。',
      '出力は monthly schedule のみを使ってください。',
      'channelName は # を付けないチャンネル名、mentionNames は @ を付けない表示名の配列にしてください。',
      'actionSpec.type は poll 固定です。',
      `候補チャンネル: ${channelCandidates.map(c => `#${c.name}`).join(', ') || '(なし)'}`,
      `候補メンバー: ${memberCandidates.map(c => `@${c.displayName}`).join(', ') || '(なし)'}`,
      `instruction: ${rawInstruction}`,
    ].join('\n'),
  })

  const channelId = resolveChannelId(object.channelName, channelCandidates)
  const mentions = resolveMentions(object.mentionNames, memberCandidates)
  const nextRunAt = computeNextRunAt(object.schedule, now)
  const mentionPreview = mentions.length > 0 ? ` @${mentions.map(mention => mention.displayName).join(' @')}` : ''
  const preview = `次回 ${formatPreviewDate(nextRunAt)} (JST) に #${object.channelName} で${mentionPreview} をメンションし、「${object.actionSpec.prompt}」の投票を投稿します。`

  return {
    channelId,
    schedule: object.schedule,
    actionSpec: object.actionSpec,
    mentionUserIds: mentions.map(mention => mention.userId),
    mentions,
    nextRunAt,
    preview,
  }
}
