// Copyright 2026 Cairn Contributors
// SPDX-License-Identifier: Apache-2.0

// 「Cairn でログイン」（OIDC）の同意画面で使う共通処理（docs/oidc-design.md §6）。
// 認可コード・トークン・ID トークンは Supabase Auth の OAuth 2.1 Server が発行し、
// Cairn は同意画面で許可・拒否を Supabase に伝えるだけ。

/**
 * Supabase が同意画面へ付けて渡す authorization_id の形。UUID ではなく英数字の乱数
 * （例: 4oyac733lgevzscx7jvbi2ufm3nvz2u4）なので、URL やパスに混ぜても安全な文字と長さだけを許す。
 * 正しいかどうかは Supabase の getAuthorizationDetails が判定する
 */
const AUTHORIZATION_ID_PATTERN = /^[A-Za-z0-9_-]{1,128}$/

export function parseAuthorizationId(value: unknown): string | null {
  if (typeof value !== 'string') return null
  return AUTHORIZATION_ID_PATTERN.test(value) ? value : null
}

/**
 * 要求されたスコープを、利用者が読んで分かる説明（翻訳キー）へ変換する。
 * Supabase の OAuth 2.1 Server が扱うスコープは openid / email / profile / phone だけで、
 * 独自スコープは作れない。知らないスコープは隠さず、そのまま表示する。
 */
export function describeOidcScopes(scope: string): string[] {
  const descriptions: string[] = []
  for (const name of scope.split(/\s+/).filter(Boolean)) {
    switch (name) {
      case 'openid':
        descriptions.push('Your Cairn account ID')
        break
      case 'profile':
        descriptions.push('Your name and profile picture')
        break
      case 'email':
        descriptions.push('Your email address')
        break
      case 'phone':
        descriptions.push('Your phone number')
        break
      default:
        descriptions.push(name)
    }
  }
  return descriptions
}
