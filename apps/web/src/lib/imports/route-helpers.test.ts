// Copyright 2026 Cairn Contributors
// SPDX-License-Identifier: Apache-2.0

import { afterEach, beforeEach, describe, expect, test, vi } from 'vitest'
import { NextResponse } from 'next/server'
import { z } from 'zod'

const { mockGetAuthContext } = vi.hoisted(() => ({ mockGetAuthContext: vi.fn() }))
vi.mock('@/lib/get-auth-context', () => ({ getAuthContext: mockGetAuthContext }))
vi.mock('@cairn/db', () => ({}))

import { parseJsonBody, withImportAdmin } from './route-helpers'
import { ImportServiceError } from './service'

const ORIGINAL_OPERATORS = process.env['IMPORT_OPERATOR_USER_IDS']

function asRole(role: string) {
  mockGetAuthContext.mockResolvedValue({ ctx: { userId: 'u1', workspaceId: 'ws1', role }, error: null })
}

describe('withImportAdmin', () => {
  beforeEach(() => { process.env['IMPORT_OPERATOR_USER_IDS'] = 'u1' })
  afterEach(() => {
    vi.clearAllMocks()
    if (ORIGINAL_OPERATORS === undefined) delete process.env['IMPORT_OPERATOR_USER_IDS']
    else process.env['IMPORT_OPERATOR_USER_IDS'] = ORIGINAL_OPERATORS
  })

  test.each(['member', 'guest'])('%s は 403 で、処理を呼ばない', async (role) => {
    asRole(role)
    const handler = vi.fn()
    const res = await withImportAdmin('test', handler)
    expect(res.status).toBe(403)
    expect(handler).not.toHaveBeenCalled()
  })

  test.each(['owner', 'admin'])('%s は処理を呼ぶ', async (role) => {
    asRole(role)
    const res = await withImportAdmin('test', async ctx => NextResponse.json(ctx))
    expect(res.status).toBe(200)
    await expect(res.json()).resolves.toEqual({ userId: 'u1', workspaceId: 'ws1' })
  })

  test.each(['owner', 'admin'])('運営者でない %s は 403 で、処理を呼ばない', async (role) => {
    process.env['IMPORT_OPERATOR_USER_IDS'] = 'someone-else'
    asRole(role)
    const handler = vi.fn()
    const res = await withImportAdmin('test', handler)
    expect(res.status).toBe(403)
    expect(handler).not.toHaveBeenCalled()
  })

  test('運営者の一覧が未設定なら誰も使えない', async () => {
    delete process.env['IMPORT_OPERATOR_USER_IDS']
    asRole('owner')
    const handler = vi.fn()
    const res = await withImportAdmin('test', handler)
    expect(res.status).toBe(403)
    expect(handler).not.toHaveBeenCalled()
  })

  test('認証できなければ認証エラーをそのまま返す', async () => {
    mockGetAuthContext.mockResolvedValue({ ctx: null, error: NextResponse.json({ error: 'unauthorized' }, { status: 401 }) })
    const res = await withImportAdmin('test', vi.fn())
    expect(res.status).toBe(401)
  })

  test('ImportServiceError は状態コードとメッセージを返す', async () => {
    asRole('admin')
    const res = await withImportAdmin('test', async () => { throw new ImportServiceError(409, 'この取り込みジョブは終了しています') })
    expect(res.status).toBe(409)
    await expect(res.json()).resolves.toEqual({ error: 'この取り込みジョブは終了しています' })
  })

  test('想定外のエラーは 500 にし、ログにはエラーの種類とメッセージだけを出す', async () => {
    asRole('admin')
    const error = vi.spyOn(console, 'error').mockImplementation(() => {})
    const err = Object.assign(new Error('insert failed'), { detail: 'Key (content)=(秘密の本文) already exists' })
    const res = await withImportAdmin('test', async () => { throw err })
    expect(res.status).toBe(500)
    expect(JSON.stringify(error.mock.calls)).not.toContain('秘密の本文')
    error.mockRestore()
  })
})

describe('parseJsonBody', () => {
  test('検証エラーでは入力値を返さず、項目とメッセージだけを返す', async () => {
    const schema = z.object({ text: z.string().max(3) })
    const req = new Request('http://localhost', { method: 'POST', body: JSON.stringify({ text: '秘密の本文' }) })
    const { error } = await parseJsonBody(req, schema)
    expect(error?.status).toBe(422)
    expect(JSON.stringify(await error!.json())).not.toContain('秘密の本文')
  })
})
