// Copyright 2026 Cairn Contributors
// SPDX-License-Identifier: Apache-2.0

// 明白なケースだけを止めるローカル・決定的な補助フィルター。通報とブロックが主な安全策。
const RULES = [
  /(?:殺す|殺害する|ぶっ殺す)(?:ぞ|から|してやる|！|!|$)/u,
  /(?:死ね|消えろ)(?:！|!|$)/u,
  /(?:レイプ|強姦)(?:する|してやる|しろ)/u,
  /(?:無料|副業|投資).{0,40}(?:DM|連絡|稼げ|万円|保証)/u,
]

export function unsafeMessageError(content: string): string | null {
  return RULES.some(rule => rule.test(content))
    ? 'この内容は安全上の理由で送信できません。表現を見直してください。'
    : null
}
