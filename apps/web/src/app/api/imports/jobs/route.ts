// Copyright 2026 Cairn Contributors
// SPDX-License-Identifier: Apache-2.0

import { NextResponse } from 'next/server'
import { createImportJob, listImportJobs } from '@/lib/imports/service'
import { createImportJobSchema } from '@/lib/imports/schema'
import { parseJsonBody, withImportAdmin } from '@/lib/imports/route-helpers'

export async function GET() {
  return withImportAdmin('list jobs', async ({ workspaceId }) => NextResponse.json(await listImportJobs(workspaceId)))
}

/** 取り込みジョブを作る。管理者が確認した会話・取り込み先チャンネル・投稿者の紐づけを登録する（メッセージはまだ書かない） */
export async function POST(req: Request) {
  return withImportAdmin('create job', async ({ userId, workspaceId }) => {
    const { data, error } = await parseJsonBody(req, createImportJobSchema)
    if (error) return error
    return NextResponse.json(await createImportJob(workspaceId, userId, data), { status: 201 })
  })
}
