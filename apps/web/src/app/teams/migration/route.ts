// Copyright 2026 Cairn Contributors
// SPDX-License-Identifier: Apache-2.0

import { readFile } from 'node:fs/promises'
import { join } from 'node:path'
import { NextResponse } from 'next/server'
import { injectPublicPageHeadScripts, PUBLIC_PAGE_CACHE_CONTROL } from '@/lib/lp/head-scripts'
import { renderTeamsMigrationPage } from '@/lib/lp/teams-migration-content'

// Teams コミュニティからの移行の案内ページ（Google 広告の遷移先）。未ログインでも見られる公開ページ。
// 1 時間 CDN に載せる。計測タグは再検証のときに環境変数から埋め直す。ログイン済みでもこのページは見せる。
export const revalidate = 3600

export async function GET() {
  const template = await readFile(join(process.cwd(), 'public/teams-migration.html'), 'utf8')

  return new NextResponse(injectPublicPageHeadScripts(renderTeamsMigrationPage(template)), {
    headers: {
      'content-type': 'text/html; charset=utf-8',
      'Cache-Control': PUBLIC_PAGE_CACHE_CONTROL,
    },
  })
}
