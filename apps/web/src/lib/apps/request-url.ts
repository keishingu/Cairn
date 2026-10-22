// Copyright 2026 Cairn Contributors
// SPDX-License-Identifier: Apache-2.0

import { lookup, type LookupAddress } from 'node:dns'
import { isIP, type LookupFunction } from 'node:net'

// アプリの Request URL へ送ってよいか（SSRF 対策。docs/app-platform-design.md §5.4）。
// - https だけ。名前解決した結果にプライベート・ループバック・リンクローカル等が1つでもあれば送らない
// - 検証は登録時の確認（checkRequestUrl）と、実際に接続するときの名前解決（guardedLookup）の両方で行う。
//   後者で接続先のアドレスそのものを確かめるので、検証と接続の間に DNS を内部アドレスへ差し替えられても送らない
// - 例外は開発環境だけ: NODE_ENV が production 以外で APP_PLATFORM_ALLOW_LOOPBACK_REQUEST_URL=true のとき、
//   APP_URL と同じ origin の http ループバック（ローカルの投票アプリ）を許す。本番・Preview では設定しても効かない

export type RequestUrlCheck = { ok: true; url: URL; devLoopback: boolean } | { ok: false; reason: string }

type Resolver = (hostname: string) => Promise<string[]>

const defaultResolver: Resolver = (hostname) =>
  new Promise((resolve, reject) => {
    lookup(hostname, { all: true, verbatim: true }, (err, addresses) => (err ? reject(err) : resolve(addresses.map((entry) => entry.address))))
  })

export async function checkRequestUrl(raw: string, options: { resolve?: Resolver; env?: NodeJS.ProcessEnv } = {}): Promise<RequestUrlCheck> {
  const env = options.env ?? process.env
  let url: URL
  try {
    url = new URL(raw)
  } catch {
    return { ok: false, reason: 'Request URL を解釈できません' }
  }
  if (url.username || url.password) return { ok: false, reason: 'Request URL に認証情報を含めないでください' }

  if (isDevLoopbackAllowed(url, env)) return { ok: true, url, devLoopback: true }
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
  return { ok: true, url, devLoopback: false }
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

/**
 * http(s).request の lookup に渡す名前解決。解決したアドレスに内部のものが1つでもあれば接続させない。
 * allowLoopback は開発環境の例外（checkRequestUrl が devLoopback を返したとき）だけ true にする
 */
export function guardedLookup(allowLoopback: boolean, resolver: typeof lookup = lookup): LookupFunction {
  return (hostname, options, callback) => {
    resolver(hostname, { all: true, verbatim: true }, (err, addresses) => {
      if (err) return callback(err, [])
      const blocked = addresses.find((entry) => isNonPublicAddress(entry.address) && !(allowLoopback && isLoopback(entry.address)))
      if (blocked || addresses.length === 0) {
        const error: NodeJS.ErrnoException = new Error('Request URL が内部のアドレスを指しています')
        error.code = 'EBLOCKEDADDRESS'
        return callback(error, [])
      }
      if (options.all) return callback(null, addresses as LookupAddress[])
      const [first] = addresses
      callback(null, first!.address, first!.family)
    })
  }
}

function isLoopback(address: string): boolean {
  if (isIP(address) === 4) return address.startsWith('127.')
  const groups = expandIpv6(address)
  return groups !== null && groups.slice(0, 7).every((group) => group === 0) && groups[7] === 1
}

/**
 * 公開インターネット以外のアドレスか。IPv4 は既知の非公開の範囲を、IPv6 は8組に展開してから判定する
 * （`::ffff:a00:1` のように表記を変えた IPv4 射影アドレスで判定をすり抜けさせない）。
 * IPv6 は公開のユニキャスト（2000::/3）だけを通し、その中でも IPv4 を埋め込む・ドキュメント用の範囲は中身か範囲で判定する
 */
export function isNonPublicAddress(address: string): boolean {
  const version = isIP(address)
  if (version === 4) return isNonPublicIpv4(address)
  if (version !== 6) return true
  const groups = expandIpv6(address)
  if (!groups) return true

  const embedded = (high: number, low: number) => `${high >> 8}.${high & 0xff}.${low >> 8}.${low & 0xff}`
  // ::ffff:a.b.c.d（IPv4 射影）と ::a.b.c.d（IPv4 互換）は、中の IPv4 で判定する
  if (groups.slice(0, 5).every((group) => group === 0) && (groups[5] === 0xffff || groups[5] === 0)) {
    return isNonPublicIpv4(embedded(groups[6]!, groups[7]!))
  }
  // 2002::/16（6to4）は2・3組目に IPv4 を埋め込む
  if (groups[0] === 0x2002) return isNonPublicIpv4(embedded(groups[1]!, groups[2]!))
  // 公開のユニキャスト（2000::/3）以外はすべて内部扱い（ループバック・リンクローカル・ULA・マルチキャスト・NAT64 など）
  if ((groups[0]! & 0xe000) !== 0x2000) return true
  // 2001:db8::/32（ドキュメント用）と 2001::/32（Teredo）
  if (groups[0] === 0x2001 && (groups[1] === 0x0db8 || groups[1] === 0)) return true
  return false
}

/** IPv6 を8組の16ビット値にする。`::` の省略と、末尾の IPv4 表記に対応する。解釈できなければ null */
export function expandIpv6(address: string): number[] | null {
  let text = address.toLowerCase().split('%')[0]!
  const ipv4Tail = /(\d+\.\d+\.\d+\.\d+)$/.exec(text)
  if (ipv4Tail) {
    const octets = ipv4Tail[1]!.split('.').map(Number)
    if (octets.some((octet) => octet > 255)) return null
    text = text.slice(0, -ipv4Tail[1]!.length) + `${((octets[0]! << 8) | octets[1]!).toString(16)}:${((octets[2]! << 8) | octets[3]!).toString(16)}`
  }
  const halves = text.split('::')
  if (halves.length > 2) return null
  const parse = (part: string) => (part === '' ? [] : part.split(':'))
  const head = parse(halves[0]!)
  const tail = halves.length === 2 ? parse(halves[1]!) : []
  const missing = 8 - head.length - tail.length
  if (halves.length === 1 ? head.length !== 8 : missing < 1) return null
  const groups = [...head, ...Array<string>(halves.length === 2 ? missing : 0).fill('0'), ...tail]
  if (groups.some((group) => !/^[0-9a-f]{1,4}$/.test(group))) return null
  return groups.map((group) => parseInt(group, 16))
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
