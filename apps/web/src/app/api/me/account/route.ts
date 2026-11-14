// Copyright 2026 Cairn Contributors
// SPDX-License-Identifier: Apache-2.0

import { NextResponse } from 'next/server'
import { z } from 'zod'
import { getAuthUser } from '@/lib/get-auth-context'
import { deleteAccount, LastOwnerAccountDeletionError } from '@/lib/account-deletion'

const deleteAccountSchema = z.object({ confirmation: z.literal('削除') })

export async function DELETE(request: Request) {
  const { userId, error } = await getAuthUser()
  if (error) return error

  let body: unknown
  try {
    body = await request.json()
  } catch {
    return NextResponse.json({ error: 'リクエスト形式が不正です' }, { status: 400 })
  }

  if (!deleteAccountSchema.safeParse(body).success) {
    return NextResponse.json({ error: '確認欄に「削除」と入力してください' }, { status: 422 })
  }

  try {
    await deleteAccount(userId)
    return NextResponse.json({ deleted: true })
  } catch (accountError) {
    if (accountError instanceof LastOwnerAccountDeletionError) {
      return NextResponse.json(
        {
          error:
            '最後のオーナーになっているワークスペースがあります。別のメンバーへオーナーを移譲してから削除してください。',
          code: 'LAST_OWNER',
          workspaces: accountError.workspaces,
        },
        { status: 409 },
      )
    }

    console.error('[DELETE /api/me/account]', accountError)
    return NextResponse.json(
      { error: 'アカウントを削除できませんでした。時間をおいて再度お試しください' },
      { status: 500 },
    )
  }
}
