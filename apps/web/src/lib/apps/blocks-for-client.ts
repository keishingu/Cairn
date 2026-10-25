// Copyright 2026 Cairn Contributors
// SPDX-License-Identifier: Apache-2.0

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
 * カードの版。chat.update のたびに進む message_blocks.updated_at（DB の精度の文字列）をそのまま使う。
 * 見えないボタンの value の変更でも変わり、value から計算した値をクライアントへ渡さない（ハッシュだと値の総当たりで推測され得る）
 */
export function cardRevision(blocksUpdatedAt: string | null): string | null {
  return blocksUpdatedAt
}
