// Copyright 2026 Cairn Contributors
// SPDX-License-Identifier: Apache-2.0

import { NextResponse } from 'next/server'
import { listImportedConversations } from '@/lib/imports/service'
import { importSourceSchema } from '@/lib/imports/schema'
import { withImportAdmin } from '@/lib/imports/route-helpers'

/** 過去に取り込んだ会話と取り込み先チャンネル（再実行で同じチャンネルを選ぶため） */
export async function GET(req: Request) {
  return withImportAdmin('list imported conversations', async ({ workspaceId }) => {
    const source = importSourceSchema.safeParse(new URL(req.url).searchParams.get('source') ?? 'teams-consumer')
    if (!source.success) return NextResponse.json({ error: '取り込み元が不正です' }, { status: 400 })
    return NextResponse.json(await listImportedConversations(workspaceId, source.data))
  })
}
