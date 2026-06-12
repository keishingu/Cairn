// 実機の WebView から Web バンドル経由でローカル Supabase に繋ぐための、
// apps/web/.env.local の NEXT_PUBLIC_SUPABASE_URL を Mac の LAN IP へ置換するスクリプト。
//
// 背景: WebView 内 JS は端末上で実行されるため 127.0.0.1 は端末自身を指してしまう。
//       Web バンドルに埋め込まれる NEXT_PUBLIC_SUPABASE_URL が 127.0.0.1 のままだと、
//       ログイン後に画面が真っ白になりネイティブのログイン画面に戻されるタイムアウトが発生する。
//
// ネイティブ側（apps/mobile）の接続先 URL は Metro の接続先ホストから自動導出される
// （apps/mobile/lib/env.ts）ため、このスクリプトの対象外。EXPO_PUBLIC_* を .env.local で
// 設定している場合は固定 URL への明示的な上書きとみなし、書き換えない。
//
// Usage: node scripts/setup-mobile-lan.mjs
//   事前に apps/web/.env.local を .env.local.example からコピーしておくこと。

import { readFileSync, writeFileSync, existsSync } from 'fs'
import { networkInterfaces } from 'os'
import { fileURLToPath } from 'url'
import { dirname, join } from 'path'

const __dirname = dirname(fileURLToPath(import.meta.url))
const root = join(__dirname, '..')

function detectLanIp() {
  const candidates = []
  for (const ifaces of Object.values(networkInterfaces())) {
    for (const iface of ifaces ?? []) {
      if (iface.family === 'IPv4' && !iface.internal) candidates.push(iface.address)
    }
  }
  if (candidates.length === 0) {
    throw new Error('LAN IP が見つかりませんでした。Wi-Fi / 有線LAN に接続されているか確認してください。')
  }
  // 192.168.x.x / 10.x.x.x の一般的な家庭内LANを優先する
  return candidates.find(ip => ip.startsWith('192.168.') || ip.startsWith('10.')) ?? candidates[0]
}

// http://<host>:PORT のホスト部分を常に現在の LAN IP に揃える。
// localhost / 127.0.0.1 だけでなく、Wi-Fi 切替などで古くなった LAN IP
// （例: 192.168.1.97 のまま）もまとめて現在の IP に修正できるようにする。
function rewriteHost(value, lanIp) {
  return value.replace(/(https?:\/\/)[^/:]+(:\d+)/, `$1${lanIp}$2`)
}

function patchEnvFile(path, keys, lanIp) {
  if (!existsSync(path)) {
    console.warn(`[skip] ${path} が存在しません。.env.local.example からコピーしてから実行してください`)
    return
  }
  const lines = readFileSync(path, 'utf-8').split('\n')
  let changed = false
  const next = lines.map(line => {
    const match = line.match(/^([A-Z0-9_]+)=(.*)$/)
    if (!match || !keys.includes(match[1])) return line
    const rewritten = rewriteHost(match[2], lanIp)
    if (rewritten !== match[2]) changed = true
    return `${match[1]}=${rewritten}`
  })
  if (changed) {
    writeFileSync(path, next.join('\n'))
    console.log(`[updated] ${path}`)
  } else {
    console.log(`[no change] ${path}`)
  }
}

const lanIp = detectLanIp()
console.log(`LAN IP: ${lanIp}`)

patchEnvFile(join(root, 'apps/web/.env.local'), ['NEXT_PUBLIC_SUPABASE_URL'], lanIp)
