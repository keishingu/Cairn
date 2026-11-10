// Copyright 2026 Cairn Contributors
// SPDX-License-Identifier: Apache-2.0

import { NextResponse } from 'next/server'
import { linkImportIdentity } from '@/lib/imports/service'
import { linkIdentitySchema } from '@/lib/imports/schema'
import { parseJsonBody, withImportLinker } from '@/lib/imports/route-helpers'

type RouteContext = { params: Promise<{ identityId: string }> }

/**
 * owner / admin が確認して、取り込んだ投稿者を Cairn のメンバーに紐づける（null で外す）。表示名だけで自動では紐づけない。
 * 公開済みのメッセージとリアクションの送信者も付け替える
 */
export async function PATCH(req: Request, { params }: RouteContext) {
  const { identityId } = await params
  return withImportLinker('link identity', async ({ userId, workspaceId }) => {
    const { data, error } = await parseJsonBody(req, linkIdentitySchema)
    if (error) return error
    return NextResponse.json(await linkImportIdentity(workspaceId, userId, identityId, data.userId))
  })
}
