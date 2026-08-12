// Copyright 2026 Cairn Contributors
// SPDX-License-Identifier: Apache-2.0

import { afterEach, describe, expect, it, vi } from 'vitest'
import { NextResponse } from 'next/server'

const { mockGetAuthUser, mockDeleteAccount, mockHasAccountLifecycleSchema } = vi.hoisted(() => ({
  mockGetAuthUser: vi.fn(),
  mockDeleteAccount: vi.fn(),
  mockHasAccountLifecycleSchema: vi.fn().mockResolvedValue(true),
}))

vi.mock('@/lib/get-auth-context', () => ({ getAuthUser: mockGetAuthUser }))
vi.mock('@/lib/account-deletion', async (importOriginal) => {
  const original = await importOriginal<typeof import('@/lib/account-deletion')>()
  return { ...original, deleteAccount: mockDeleteAccount }
})
vi.mock('@/lib/access/account-lifecycle-lock', () => ({
  hasAccountLifecycleSchema: mockHasAccountLifecycleSchema,
}))
vi.mock('@cairn/db', () => ({ db: {} }))

function request(body: unknown) {
  return new Request('https://oss-cairn.com/api/me/account', {
    method: 'DELETE',
    headers: {
      'Content-Type': 'application/json',
    },
    body: JSON.stringify(body),
  })
}

describe('DELETE /api/me/account', () => {
  afterEach(() => vi.clearAllMocks())

  it('未認証なら削除処理を呼ばず401を返す', async () => {
    mockGetAuthUser.mockResolvedValue({
      userId: null,
      error: NextResponse.json({ error: 'Unauthorized' }, { status: 401 }),
    })

    const { DELETE } = await import('./route')
    const response = await DELETE(request({ confirmation: '削除' }))

    expect(response.status).toBe(401)
    expect(mockDeleteAccount).not.toHaveBeenCalled()
  })

  it('確認文字が一致しなければ422を返す', async () => {
    mockGetAuthUser.mockResolvedValue({ userId: 'user-1', error: null })

    const { DELETE } = await import('./route')
    const response = await DELETE(request({ confirmation: 'delete' }))

    expect(response.status).toBe(422)
    expect(mockDeleteAccount).not.toHaveBeenCalled()
  })

  it('認証済み本人のアカウントを削除する', async () => {
    mockGetAuthUser.mockResolvedValue({ userId: 'user-1', error: null })
    mockDeleteAccount.mockResolvedValue(undefined)

    const { DELETE } = await import('./route')
    const response = await DELETE(request({ confirmation: '削除' }))

    expect(response.status).toBe(200)
    await expect(response.json()).resolves.toEqual({ deleted: true })
    expect(mockDeleteAccount).toHaveBeenCalledWith('user-1')
  })

  it('DB migration前は503を返して削除を始めない', async () => {
    mockGetAuthUser.mockResolvedValue({ userId: 'user-1', error: null })
    mockHasAccountLifecycleSchema.mockResolvedValueOnce(false)

    const { DELETE } = await import('./route')
    const response = await DELETE(request({ confirmation: '削除' }))

    expect(response.status).toBe(503)
    expect(mockDeleteAccount).not.toHaveBeenCalled()
  })

  it('最後のownerなら対象ワークスペースを返す', async () => {
    mockGetAuthUser.mockResolvedValue({ userId: 'user-1', error: null })
    const { LastOwnerAccountDeletionError } = await import('@/lib/account-deletion')
    mockDeleteAccount.mockRejectedValue(
      new LastOwnerAccountDeletionError([{ id: 'workspace-1', name: '山岳部' }]),
    )

    const { DELETE } = await import('./route')
    const response = await DELETE(request({ confirmation: '削除' }))

    expect(response.status).toBe(409)
    await expect(response.json()).resolves.toMatchObject({
      code: 'LAST_OWNER',
      workspaces: [{ id: 'workspace-1', name: '山岳部' }],
    })
  })
})
