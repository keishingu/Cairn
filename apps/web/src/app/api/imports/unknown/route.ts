// Copyright 2026 Cairn Contributors
// SPDX-License-Identifier: Apache-2.0

import { NextResponse } from 'next/server'
import { resolveUnknownMessages } from '@/lib/imports/service'
import { resolveUnknownSchema } from '@/lib/imports/schema'
import { parseJsonBody, withImportAdmin } from '@/lib/imports/route-helpers'

/**
 * 投稿者不明の投稿の発言者を、外部データ（ブラウザのキャッシュ・他の参加者のエクスポート）から補う（運営者）。
 * 残していた投稿は、次にその会話を公開したときに出る
 */
export async function POST(req: Request) {
  return withImportAdmin('resolve unknown', async ({ workspaceId }) => {
    const { data, error } = await parseJsonBody(req, resolveUnknownSchema)
    if (error) return error
    return NextResponse.json(await resolveUnknownMessages(workspaceId, data))
  })
}
