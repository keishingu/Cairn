// Copyright 2026 Cairn Contributors
// SPDX-License-Identifier: Apache-2.0

import { stripMentionsToText } from '@/lib/chat/mentions'
import { formatTaskTitleForDisplay } from '@/lib/task-title-display'

export const TASK_TITLE_MAX_LENGTH = 200

// 行頭の引用記号・見出し記号・リスト記号・チェックボックスを繰り返し剥がす。
const LINE_PREFIX_RE = /^(?:>\s*|#{1,6}(?:\s+|$)|[-*+]\s+\[[ xX]\](?:\s+|$)|[-*+](?:\s+|$)|\d+[.)]\s+)/

function stripLinePrefix(line: string): string {
  let current = line.trim()
  for (;;) {
    const next = current.replace(LINE_PREFIX_RE, '').trim()
    if (next === current) return current
    current = next
  }
}

/**
 * メッセージ本文からタスクタイトルを作る。メンションは `@表示名`、Markdown 装飾は除去し、
 * 行頭記号を除いた最初の空でない行を 200 文字に切り詰めて返す。使える行が無ければ空文字。
 */
export function taskTitleFromMessage(
  content: string,
  nameOf?: (id: string) => string | undefined,
): string {
  const text = stripMentionsToText(content, nameOf)
  for (const line of text.split(/\r?\n/)) {
    if (/^\s*(```|~~~)/.test(line)) continue
    const title = formatTaskTitleForDisplay(stripLinePrefix(line))
    if (title) return Array.from(title).slice(0, TASK_TITLE_MAX_LENGTH).join('')
  }
  return ''
}
