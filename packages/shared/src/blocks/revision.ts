// Copyright 2026 Cairn Contributors
// SPDX-License-Identifier: Apache-2.0

// クライアントが描いているカードの版。サーバーは保存済みの blocks（クライアントへ返す形）から同じ値を計算し、
// 操作を受けたときに一致を確かめる。chat.update で書き換わった後に古いカードのボタンが押されたら、新しいカードの値で届けない。
// 改ざんへの備えではなく古さの検出なので、暗号学的なハッシュは使わない（Web・ネイティブで同じ計算をするため）

function canonical(value: unknown): string {
  if (Array.isArray(value)) return `[${value.map(canonical).join(',')}]`
  if (typeof value === 'object' && value !== null) {
    const entries = Object.keys(value as Record<string, unknown>)
      .filter((key) => (value as Record<string, unknown>)[key] !== undefined)
      .sort()
      .map((key) => `${JSON.stringify(key)}:${canonical((value as Record<string, unknown>)[key])}`)
    return `{${entries.join(',')}}`
  }
  return JSON.stringify(value) ?? 'null'
}

/** FNV-1a（32bit）を2本（別の初期値）並べた16桁の16進 */
export function blocksRevision(blocks: unknown): string {
  const text = canonical(blocks)
  let a = 0x811c9dc5
  let b = 0x01000193 ^ 0x5bd1e995
  for (let i = 0; i < text.length; i++) {
    const code = text.charCodeAt(i)
    a = Math.imul(a ^ code, 0x01000193) >>> 0
    b = Math.imul(b ^ code, 0x01000193) >>> 0
  }
  return a.toString(16).padStart(8, '0') + b.toString(16).padStart(8, '0')
}
