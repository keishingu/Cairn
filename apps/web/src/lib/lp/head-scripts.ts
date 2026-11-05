// Copyright 2026 Cairn Contributors
// SPDX-License-Identifier: Apache-2.0

// 公開の静的ページ（LP の `/` や今後の案内ページ）の <head> に差し込む計測スクリプト。
// ログイン後のアプリ画面には入れない。どちらも環境変数が無ければ何も差し込まないため、
// ローカル・プレビュー・セルフホストでは計測しない。

function jsonForScript(value: unknown): string {
  return JSON.stringify(value).replace(/</g, '\\u003c')
}

// アプリと同じ PostHog プロジェクトの設定。cairn-lp.js が CTA クリックを計測する。
function posthogConfigScript(env: NodeJS.ProcessEnv): string {
  const token = env['NEXT_PUBLIC_POSTHOG_PROJECT_TOKEN']
  if (!token) return ''
  const host = env['NEXT_PUBLIC_POSTHOG_HOST'] || 'https://us.i.posthog.com'
  return `<script>window.__CAIRN_LP_POSTHOG__=${jsonForScript({ token, host })};</script>\n`
}

// Google 広告のタグ（gtag.js）。ID は `AW-` で始まる数字だけを受け付ける。
function googleAdsTagScript(env: NodeJS.ProcessEnv): string {
  const tagId = env['LP_GOOGLE_ADS_TAG_ID']
  if (!tagId) return ''
  if (!/^AW-\d+$/.test(tagId)) {
    throw new Error(`LP_GOOGLE_ADS_TAG_ID の形式が不正です（AW- と数字）: ${tagId}`)
  }
  return (
    `<script async src="https://www.googletagmanager.com/gtag/js?id=${tagId}"></script>\n` +
    `<script>window.dataLayer=window.dataLayer||[];function gtag(){dataLayer.push(arguments);}` +
    `gtag('js',new Date());gtag('config','${tagId}');</script>\n`
  )
}

export function injectPublicPageHeadScripts(html: string, env: NodeJS.ProcessEnv = process.env): string {
  const scripts = posthogConfigScript(env) + googleAdsTagScript(env)
  if (!scripts) return html
  if (!html.includes('</head>')) throw new Error('公開ページの HTML に </head> がありません')
  return html.replace('</head>', `${scripts}</head>`)
}
