// Copyright 2026 Cairn Contributors
// SPDX-License-Identifier: Apache-2.0

import { readFile } from 'node:fs/promises'
import { join } from 'node:path'
import { NextResponse } from 'next/server'
import { injectLoggedInHomeRedirect, injectPublicPageHeadScripts, PUBLIC_PAGE_CACHE_CONTROL } from '@/lib/lp/head-scripts'

// 1 時間 CDN に載せる。計測タグは再検証のときに環境変数から埋め直す（リクエストごとには読まない）。
// ログイン済みの /chats への戻りは、キャッシュを人ごとに分けずに head のスクリプトが行う。
export const revalidate = 3600

export async function GET() {
  const html = await readFile(join(process.cwd(), 'public/index.html'), 'utf8')

  return new NextResponse(injectLoggedInHomeRedirect(injectPublicPageHeadScripts(html)), {
    headers: {
      'content-type': 'text/html; charset=utf-8',
      'Cache-Control': PUBLIC_PAGE_CACHE_CONTROL,
    },
  })
}
