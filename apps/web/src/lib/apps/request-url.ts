// Copyright 2026 Cairn Contributors
// SPDX-License-Identifier: Apache-2.0

import { lookup } from 'node:dns/promises'
import { isIP } from 'node:net'

// アプリの Request URL へ送ってよいか（SSRF 対策。docs/app-platform-design.md §5.4）。
// - https だけ。名前解決した結果にプライベート・ループバック・リンクローカル等が1つでもあれば送らない
// - 例外は開発環境だけ: NODE_ENV が production 以外で APP_PLATFORM_ALLOW_LOOPBACK_REQUEST_URL=true のとき、
//   APP_URL と同じ origin の http ループバック（ローカルの投票アプリ）を許す。本番・Preview では設定しても効かない

export type RequestUrlCheck = { ok: true; url: URL } | { ok: false; reason: string }

type Resolver = (hostname: string) => Promise<string[]>

const defaultResolver: Resolver = async (hostname) => (await lookup(hostname, { all: true, verbatim: true })).map((entry) => entry.address)

export async function checkRequestUrl(raw: string, options: { resolve?: Resolver; env?: NodeJS.ProcessEnv } = {}): Promise<RequestUrlCheck> {
  const env = options.env ?? process.env
  let url: URL
  try {
    url = new URL(raw)
  } catch {
    return { ok: false, reason: 'Request URL を解釈できません' }
  }
  if (url.username || url.password) return { ok: false, reason: 'Request URL に認証情報を含めないでください' }

  if (isDevLoopbackAllowed(url, env)) return { ok: true, url }
  if (url.protocol !== 'https:') return { ok: false, reason: 'Request URL は https にしてください' }

  const hostname = url.hostname.replace(/^\[|\]$/g, '')
  let addresses: string[]
  try {
    addresses = isIP(hostname) ? [hostname] : await (options.resolve ?? defaultResolver)(hostname)
  } catch {
    return { ok: false, reason: 'Request URL のホストを名前解決できません' }
  }
  if (addresses.length === 0) return { ok: false, reason: 'Request URL のホストを名前解決できません' }
  if (addresses.some(isNonPublicAddress)) return { ok: false, reason: 'Request URL が内部のアドレスを指しています' }
  return { ok: true, url }
}

function isDevLoopbackAllowed(url: URL, env: NodeJS.ProcessEnv): boolean {
  if (env['NODE_ENV'] === 'production' || env['VERCEL_ENV']) return false
  if (env['APP_PLATFORM_ALLOW_LOOPBACK_REQUEST_URL'] !== 'true' || !env['APP_URL']) return false
  try {
    const appOrigin = new URL(env['APP_URL']).origin
    return url.origin === appOrigin && ['localhost', '127.0.0.1', '[::1]'].includes(url.hostname)
  } catch {
    return false
  }
}

/** 公開インターネット以外のアドレス（RFC 1918・ループバック・リンクローカル・CGNAT・ULA・未指定・マルチキャスト等） */
export function isNonPublicAddress(address: string): boolean {
  const version = isIP(address)
  if (version === 4) return isNonPublicIpv4(address)
  if (version === 6) {
    const lower = address.toLowerCase()
    // IPv4 射影アドレス（::ffff:10.0.0.1）は中の IPv4 で判定する
    const mapped = /^::ffff:(\d+\.\d+\.\d+\.\d+)$/.exec(lower)
    if (mapped) return isNonPublicIpv4(mapped[1]!)
    return (
      lower === '::' ||
      lower === '::1' ||
      lower.startsWith('fe8') || lower.startsWith('fe9') || lower.startsWith('fea') || lower.startsWith('feb') || // fe80::/10
      lower.startsWith('fc') || lower.startsWith('fd') || // fc00::/7
      lower.startsWith('ff') || // マルチキャスト
      lower.startsWith('64:ff9b:') || // NAT64
      lower.startsWith('2001:db8:') // ドキュメント用
    )
  }
  return true
}

function isNonPublicIpv4(address: string): boolean {
  const [a = 0, b = 0] = address.split('.').map(Number)
  return (
    a === 0 ||
    a === 10 ||
    a === 127 ||
    (a === 100 && b >= 64 && b <= 127) ||
    (a === 169 && b === 254) ||
    (a === 172 && b >= 16 && b <= 31) ||
    (a === 192 && b === 168) ||
    (a === 192 && b === 0) ||
    (a === 198 && (b === 18 || b === 19)) ||
    a >= 224
  )
}
