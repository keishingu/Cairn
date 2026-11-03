#!/usr/bin/env node
// Copyright 2026 Cairn Contributors
// SPDX-License-Identifier: Apache-2.0

// 「Cairn でログイン」（OIDC）の外部アプリのクライアントを、運営者が登録・無効化する（docs/oidc-design.md §8 の3）。
// 管理画面・動的登録は作らない。client secret は発行時に一度だけ表示し、DB にはハッシュだけを保存する。
//
// 使い方（リポジトリルートで、DATABASE_URL に対象環境の接続先を入れて実行する）:
//   node scripts/oidc-client.mjs create --name "Rack" --type confidential --redirect-uri https://example.com/callback [--redirect-uri ...]
//   node scripts/oidc-client.mjs create --name "Rack (PWA)" --type public --redirect-uri https://example.com/callback
//   node scripts/oidc-client.mjs list
//   node scripts/oidc-client.mjs disable --client-id cairn_oidc_client_...
import { createHash, randomBytes } from 'node:crypto'
import { createRequire } from 'node:module'

const require = createRequire(new URL('../packages/db/package.json', import.meta.url))
const { Client } = require('pg')

const CLIENT_ID_PREFIX = 'cairn_oidc_client_'
const CLIENT_SECRET_PREFIX = 'cairn_oidc_secret_'

function parseArgs(argv) {
  const [command, ...rest] = argv
  const options = { redirectUris: [] }
  for (let i = 0; i < rest.length; i += 2) {
    const key = rest[i]
    const value = rest[i + 1]
    if (value === undefined) throw new Error(`${key} の値がありません`)
    if (key === '--name') options.name = value
    else if (key === '--type') options.type = value
    else if (key === '--redirect-uri') options.redirectUris.push(value)
    else if (key === '--client-id') options.clientId = value
    else throw new Error(`知らないオプションです: ${key}`)
  }
  return { command, options }
}

// MCP 用 OAuth の isValidRedirectUri と同じ基準。https か、ローカル開発用のループバックの http だけを許す
function isValidRedirectUri(value) {
  try {
    const url = new URL(value)
    if (url.hash || url.username || url.password) return false
    if (url.protocol === 'https:') return true
    if (url.protocol !== 'http:') return false
    return url.hostname === 'localhost' || url.hostname === '127.0.0.1' || url.hostname === '[::1]'
  } catch {
    return false
  }
}

function secret(prefix) {
  const value = `${prefix}${randomBytes(32).toString('base64url')}`
  return { value, hash: createHash('sha256').update(value).digest('hex') }
}

async function main() {
  const { command, options } = parseArgs(process.argv.slice(2))
  if (!process.env.DATABASE_URL) throw new Error('DATABASE_URL を指定してください')
  const client = new Client({ connectionString: process.env.DATABASE_URL })
  await client.connect()
  try {
    if (command === 'create') {
      if (!options.name?.trim()) throw new Error('--name を指定してください')
      if (options.type !== 'public' && options.type !== 'confidential') {
        throw new Error('--type は public（サーバーを持たないアプリ）か confidential（サーバーを持つアプリ）です')
      }
      if (options.redirectUris.length === 0) throw new Error('--redirect-uri を1つ以上指定してください')
      const invalid = options.redirectUris.filter((uri) => !isValidRedirectUri(uri))
      if (invalid.length > 0) throw new Error(`https ではないか不正なリダイレクト URI です: ${invalid.join(', ')}`)

      const clientId = `${CLIENT_ID_PREFIX}${randomBytes(16).toString('base64url')}`
      const clientSecret = options.type === 'confidential' ? secret(CLIENT_SECRET_PREFIX) : null
      await client.query(
        `insert into oidc_clients (client_id, client_name, redirect_uris, client_type, client_secret_hash)
         values ($1, $2, $3::jsonb, $4, $5)`,
        [clientId, options.name.trim(), JSON.stringify(options.redirectUris), options.type, clientSecret?.hash ?? null],
      )
      console.log(`client_id:     ${clientId}`)
      if (clientSecret) {
        console.log(`client_secret: ${clientSecret.value}`)
        console.log('client_secret はこの一度しか表示しません。外部アプリのサーバーにだけ置いてください。')
      }
      return
    }
    if (command === 'list') {
      const { rows } = await client.query(
        `select client_id, client_name, client_type, redirect_uris, disabled_at, created_at
         from oidc_clients order by created_at`,
      )
      for (const row of rows) {
        const status = row.disabled_at ? `disabled ${row.disabled_at.toISOString()}` : 'active'
        console.log(`${row.client_id}  ${row.client_type}  ${status}  ${row.client_name}  ${row.redirect_uris.join(' ')}`)
      }
      return
    }
    if (command === 'disable') {
      if (!options.clientId) throw new Error('--client-id を指定してください')
      const { rows } = await client.query(
        `update oidc_clients set disabled_at = now()
         where client_id = $1 and disabled_at is null
         returning client_id`,
        [options.clientId],
      )
      if (rows.length === 0) throw new Error('有効なクライアントが見つかりません')
      console.log(`disabled: ${options.clientId}`)
      return
    }
    throw new Error('コマンドは create / list / disable のどれかです')
  } finally {
    await client.end()
  }
}

main().catch((error) => {
  console.error(error.message)
  process.exit(1)
})
