// Copyright 2026 Cairn Contributors
// SPDX-License-Identifier: Apache-2.0

// ChatGPT 広告のクリック ID（oppref）。OpenAI は広告のリンク先 URL に `?oppref=...` を付ける。
// OpenAI のピクセルは入れず、最初に着地したページで一次 Cookie に保存し、
// ワークスペース作成時にサーバーから Conversions API へそのまま渡す（docs/ad-conversion-tracking.md）。
export const OPPREF_PARAM = 'oppref'
export const OPPREF_COOKIE = 'cairn_oppref'
/** OpenAI のピクセルと同じく、クリックから 30 日を計測期間にする */
export const OPPREF_COOKIE_MAX_AGE_SECONDS = 30 * 24 * 60 * 60
const OPPREF_MAX_LENGTH = 1024

/** ChatGPT 広告の計測が有効な環境か（Vercel Production のみ設定する） */
export function isOpenAiAdsConfigured(): boolean {
  return Boolean(process.env['OPENAI_ADS_PIXEL_ID'] && process.env['OPENAI_ADS_CONVERSIONS_API_KEY'])
}

/** oppref は中身を解釈せずそのまま返す。空・極端に長い値は捨てる */
export function normalizeOppref(value: string | null | undefined): string | null {
  if (!value) return null
  if (value.length > OPPREF_MAX_LENGTH) return null
  return value
}

/** Cookie ヘッダーから oppref を取り出す（Next の cookies.set は値を encodeURIComponent する） */
export function readOpprefFromCookieHeader(cookieHeader: string | null): string | null {
  if (!cookieHeader) return null
  for (const part of cookieHeader.split(';')) {
    const eq = part.indexOf('=')
    if (eq < 0) continue
    if (part.slice(0, eq).trim() !== OPPREF_COOKIE) continue
    try {
      return normalizeOppref(decodeURIComponent(part.slice(eq + 1).trim()))
    } catch {
      return null
    }
  }
  return null
}
