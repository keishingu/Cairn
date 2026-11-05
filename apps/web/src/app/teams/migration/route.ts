// Copyright 2026 Cairn Contributors
// SPDX-License-Identifier: Apache-2.0

import { readFile } from 'node:fs/promises'
import { join } from 'node:path'
import { NextResponse } from 'next/server'
import { injectPublicPageHeadScripts } from '@/lib/lp/head-scripts'
import { renderTeamsMigrationPage } from '@/lib/lp/teams-migration-content'

// Teams コミュニティからの移行の案内ページ（Google 広告の遷移先）。未ログインでも見られる公開ページ。
// 計測タグの有無を実行時の環境変数で決めるため、ビルド時に固定しない
export const dynamic = 'force-dynamic'

export async function GET() {
  const template = await readFile(join(process.cwd(), 'public/teams-migration.html'), 'utf8')

  return new NextResponse(injectPublicPageHeadScripts(renderTeamsMigrationPage(template)), {
    headers: {
      'content-type': 'text/html; charset=utf-8',
    },
  })
}
