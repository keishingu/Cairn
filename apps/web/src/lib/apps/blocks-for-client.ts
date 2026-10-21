// Copyright 2026 Cairn Contributors
// SPDX-License-Identifier: Apache-2.0

import { createHash } from 'node:crypto'

/**
 * 保存済みの blocks をクライアントへ返す形にする。ボタンの value は落とす。
 * 押下時にサーバーが保存済み blocks から value を引いてアプリへ届けるため、クライアントは value を知る必要がなく、
 * アプリがボタンに持たせた内部の値（ID や状態）を閲覧者へ見せない（docs/app-platform-design.md §5.1）。
 * static_select の option.value は、選んだ選択肢を示すためにクライアントが送り返すので残す。
 */
export function blocksForClient(blocks: unknown): unknown[] | null {
  if (!Array.isArray(blocks)) return null
  return blocks.map(stripButtonValues)
}

function stripButtonValues(node: unknown): unknown {
  if (Array.isArray(node)) return node.map(stripButtonValues)
  if (typeof node !== 'object' || node === null) return node
  const entries = Object.entries(node as Record<string, unknown>)
  const isButton = (node as { type?: unknown }).type === 'button'
  return Object.fromEntries(
    entries.filter(([key]) => !(isButton && key === 'value')).map(([key, value]) => [key, stripButtonValues(value)]),
  )
}

/**
 * カードの版。クライアントへ返さないボタンの value の変更も含めて変わるよう、保存済みの blocks 全体から作る。
 * 中身を推測されないようハッシュにし、メッセージ ID を混ぜて別のカードと比べられないようにする。
 * 一覧（GET messages）と押下（/api/app-interactions）はどちらも DB の jsonb から読むので、同じカードなら同じ値になる
 */
export function cardRevision(storedBlocks: unknown, messageId: string): string {
  return createHash('sha256').update(messageId).update('\n').update(JSON.stringify(storedBlocks)).digest('hex').slice(0, 32)
}
