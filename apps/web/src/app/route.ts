// Copyright 2026 Cairn Contributors
// SPDX-License-Identifier: Apache-2.0

import { readFile } from 'node:fs/promises'
import { join } from 'node:path'
import { NextResponse } from 'next/server'

// LP は静的 HTML のため、アプリと同じ PostHog プロジェクトの設定をここで埋め込み、
// cairn-lp.js が CTA クリックを計測する。トークン未設定の環境では何も埋め込まない。
function posthogConfigScript(): string {
  const token = process.env['NEXT_PUBLIC_POSTHOG_PROJECT_TOKEN']
  if (!token) return ''
  const host = process.env['NEXT_PUBLIC_POSTHOG_HOST'] || 'https://us.i.posthog.com'
  const json = JSON.stringify({ token, host }).replace(/</g, '\\u003c')
  return `<script>window.__CAIRN_LP_POSTHOG__=${json};</script>\n`
}

export async function GET() {
  const html = await readFile(join(process.cwd(), 'public/index.html'), 'utf8')
  const config = posthogConfigScript()

  return new NextResponse(config ? html.replace('</head>', `${config}</head>`) : html, {
    headers: {
      'content-type': 'text/html; charset=utf-8',
    },
  })
}
