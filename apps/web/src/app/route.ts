// Copyright 2026 Cairn Contributors
// SPDX-License-Identifier: Apache-2.0

import { readFile } from 'node:fs/promises'
import { join } from 'node:path'
import { NextResponse } from 'next/server'
import { injectPublicPageHeadScripts } from '@/lib/lp/head-scripts'

// 計測タグの有無を実行時の環境変数で決めるため、ビルド時に固定しない
export const dynamic = 'force-dynamic'

export async function GET() {
  const html = await readFile(join(process.cwd(), 'public/index.html'), 'utf8')

  return new NextResponse(injectPublicPageHeadScripts(html), {
    headers: {
      'content-type': 'text/html; charset=utf-8',
    },
  })
}
