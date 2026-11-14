// Copyright 2026 Cairn Contributors
// SPDX-License-Identifier: Apache-2.0

import { NextResponse } from 'next/server'
import { listImportIdentities } from '@/lib/imports/service'
import { importSourceSchema } from '@/lib/imports/schema'
import { withImportLinker } from '@/lib/imports/route-helpers'

/** 取り込んだ投稿者の一覧（紐づけの確認・変更用） */
export async function GET(req: Request) {
  return withImportLinker('list identities', async ({ workspaceId }) => {
    const source = importSourceSchema.safeParse(new URL(req.url).searchParams.get('source') ?? 'teams-consumer')
    if (!source.success) return NextResponse.json({ error: '取り込み元が不正です' }, { status: 400 })
    return NextResponse.json(await listImportIdentities(workspaceId, source.data))
  })
}
