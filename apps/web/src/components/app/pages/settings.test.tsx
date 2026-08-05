// Copyright 2026 Cairn Contributors
// SPDX-License-Identifier: Apache-2.0

import { fireEvent, render, screen, waitFor } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import React from 'react'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import {
  getSettingsNavGroups,
  isSettingsSection,
  resolveCreditPackFulfillmentPolling,
  SettingsSectionContent,
} from './settings'

const { fetchWithAuth, processImageForUpload, toastError, toastSuccess, clipboardWriteText } =
  vi.hoisted(() => ({
    fetchWithAuth: vi.fn(),
    processImageForUpload: vi.fn(),
    toastError: vi.fn(),
    toastSuccess: vi.fn(),
    clipboardWriteText: vi.fn(),
  }))

vi.mock('next/navigation', () => ({
  usePathname: () => '/settings/account',
  useRouter: () => ({ push: vi.fn() }),
}))

vi.mock('next-themes', () => ({
  useTheme: () => ({ theme: 'system', setTheme: vi.fn() }),
}))

vi.mock('@/lib/fetch-with-auth', () => ({
  fetchWithAuth,
}))

vi.mock('@/lib/process-image', () => ({
  processImageForUpload,
}))

vi.mock('@/lib/toast', () => ({
  toast: {
    error: toastError,
    success: toastSuccess,
  },
}))

function renderAccountSection() {
  const queryClient = new QueryClient({
    defaultOptions: {
      queries: { retry: false },
    },
  })

  return render(
    <QueryClientProvider client={queryClient}>
      <SettingsSectionContent section="account" />
    </QueryClientProvider>,
  )
}

function renderIntegrationsSection() {
  const queryClient = new QueryClient({
    defaultOptions: {
      queries: { retry: false },
      mutations: { retry: false },
    },
  })

  return render(
    <QueryClientProvider client={queryClient}>
      <SettingsSectionContent section="integrations" />
    </QueryClientProvider>,
  )
}

function mockIntegrationsFetch(options?: {
  apiTokens?: unknown[]
  apiTokenListError?: boolean
  revokeError?: boolean
}) {
  fetchWithAuth.mockImplementation(async (input: string, init?: RequestInit) => {
    if (input === '/api/me' && !init) {
      return new Response(JSON.stringify({ id: USER_ID, wsRole: 'member' }))
    }
    if (input === '/api/api-tokens' && !init) {
      return options?.apiTokenListError
        ? new Response(JSON.stringify({ error: 'failed' }), { status: 500 })
        : new Response(JSON.stringify(options?.apiTokens ?? []))
    }
    if (input === '/api/api-tokens' && init?.method === 'POST') {
      return new Response(JSON.stringify({ token: 'cairn_pat_secret' }), { status: 201 })
    }
    if (input.startsWith('/api/api-tokens/') && init?.method === 'DELETE') {
      return options?.revokeError
        ? new Response(JSON.stringify({ error: 'failed' }), { status: 500 })
        : new Response(null, { status: 204 })
    }
    if (input === '/api/workspaces' && !init) {
      return new Response(JSON.stringify({ id: 'workspace-1' }))
    }
    if (input === '/api/calendar/token' && !init) {
      return new Response(JSON.stringify({ token: 'calendar-token' }))
    }
    if (input === '/api/calendar/google/status' && !init) {
      return new Response(JSON.stringify({ configured: false, connected: false }))
    }
    throw new Error(`unexpected fetch: ${input}`)
  })
}

const USER_ID = '00000000-0000-0000-0000-000000000001'

function defineArrayBuffer(file: File, bytes: Uint8Array) {
  Object.defineProperty(file, 'arrayBuffer', {
    value: async () => bytes.buffer.slice(bytes.byteOffset, bytes.byteOffset + bytes.byteLength),
  })
  return file
}

describe('SettingsSectionContent', () => {
  beforeEach(() => {
    fetchWithAuth.mockReset()
    processImageForUpload.mockReset()
    toastError.mockReset()
    toastSuccess.mockReset()
    clipboardWriteText.mockReset()
    Object.defineProperty(navigator, 'clipboard', {
      configurable: true,
      value: { writeText: clipboardWriteText },
    })

    fetchWithAuth.mockImplementation(async (input: string, init?: RequestInit) => {
      if (input === '/api/me' && !init) {
        return {
          ok: true,
          json: async () => ({
            id: 'user-1',
            displayName: '山田 太郎',
            email: 'taro@example.com',
            avatarUrl: null,
          }),
        }
      }

      if (input === '/api/me/avatar' && init?.method === 'POST') {
        return {
          ok: true,
          json: async () => ({}),
        }
      }

      throw new Error(`unexpected fetch: ${input}`)
    })
  })

  it('アバター画像を縮小後のファイルでアップロードする', async () => {
    const originalFile = new File(['original'], 'avatar.heic', { type: 'image/heic' })
    const processedFile = new File(['processed'], 'avatar.jpg', { type: 'image/jpeg' })
    processImageForUpload.mockResolvedValue({
      file: processedFile,
      takenAt: null,
      latitude: null,
      longitude: null,
    })

    const { container } = renderAccountSection()
    await screen.findByText('山田 太郎')

    const input = container.querySelector('input[type="file"]')
    expect(input).not.toBeNull()

    fireEvent.change(input as HTMLInputElement, {
      target: {
        files: [originalFile],
      },
    })

    await waitFor(() => {
      expect(processImageForUpload).toHaveBeenCalledWith(originalFile)
      expect(fetchWithAuth).toHaveBeenCalledWith('/api/me/avatar', expect.objectContaining({
        method: 'POST',
        body: expect.any(FormData),
      }))
    })

    const avatarCall = fetchWithAuth.mock.calls.find(call => call[0] === '/api/me/avatar')
    expect(avatarCall).toBeTruthy()
    const [, requestInit] = avatarCall as [string, RequestInit]
    const uploadedFile = (requestInit.body as FormData).get('file')
    expect(uploadedFile).toBe(processedFile)
    expect(screen.getByText('大きい写真は自動で縮小してアップロードします')).toBeInTheDocument()
  })

  it('GIF アバターはアップロード前に弾く', async () => {
    const originalFile = new File(['gif'], 'avatar.gif', { type: 'image/gif' })

    const { container } = renderAccountSection()
    await screen.findByText('山田 太郎')

    const input = container.querySelector('input[type="file"]')
    expect(input).not.toBeNull()

    fireEvent.change(input as HTMLInputElement, {
      target: {
        files: [originalFile],
      },
    })

    await waitFor(() => {
      expect(screen.getByText('⚠ アニメーション画像のアバターには未対応です。静止 JPEG / PNG / WebP / HEIC を選んでください')).toBeInTheDocument()
    })

    expect(processImageForUpload).not.toHaveBeenCalled()
    expect(fetchWithAuth).not.toHaveBeenCalledWith('/api/me/avatar', expect.anything())
  })

  it('animated WebP アバターはアップロード前に弾く', async () => {
    const webpBytes = new Uint8Array([
      0x52, 0x49, 0x46, 0x46,
      0x1e, 0x00, 0x00, 0x00,
      0x57, 0x45, 0x42, 0x50,
      0x56, 0x50, 0x38, 0x58,
      0x0a, 0x00, 0x00, 0x00,
      0x02, 0x00, 0x00, 0x00,
      0x00, 0x00, 0x00, 0x00,
      0x00, 0x00,
    ])
    const animatedWebp = defineArrayBuffer(
      new File([webpBytes], 'avatar.webp', { type: 'image/webp' }),
      webpBytes,
    )

    const { container } = renderAccountSection()
    await screen.findByText('山田 太郎')

    const input = container.querySelector('input[type="file"]')
    expect(input).not.toBeNull()

    fireEvent.change(input as HTMLInputElement, {
      target: {
        files: [animatedWebp],
      },
    })

    await waitFor(() => {
      expect(screen.getByText('⚠ アニメーション画像のアバターには未対応です。静止 JPEG / PNG / WebP / HEIC を選んでください')).toBeInTheDocument()
    })

    expect(processImageForUpload).not.toHaveBeenCalled()
    expect(fetchWithAuth).not.toHaveBeenCalledWith('/api/me/avatar', expect.anything())
  })

  it('APNG アバターはアップロード前に弾く', async () => {
    const apngBytes = new Uint8Array([
      0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a,
      0x00, 0x00, 0x00, 0x08,
      0x61, 0x63, 0x54, 0x4c,
      0x00, 0x00, 0x00, 0x02,
      0x00, 0x00, 0x00, 0x00,
      0x00, 0x00, 0x00, 0x00,
    ])
    const apng = defineArrayBuffer(
      new File([apngBytes], 'avatar.png', { type: 'image/png' }),
      apngBytes,
    )

    const { container } = renderAccountSection()
    await screen.findByText('山田 太郎')

    const input = container.querySelector('input[type="file"]')
    expect(input).not.toBeNull()

    fireEvent.change(input as HTMLInputElement, {
      target: {
        files: [apng],
      },
    })

    await waitFor(() => {
      expect(screen.getByText('⚠ アニメーション画像のアバターには未対応です。静止 JPEG / PNG / WebP / HEIC を選んでください')).toBeInTheDocument()
    })

    expect(processImageForUpload).not.toHaveBeenCalled()
    expect(fetchWithAuth).not.toHaveBeenCalledWith('/api/me/avatar', expect.anything())
  })
})

describe('MCP / APIトークン設定', () => {
  beforeEach(() => {
    fetchWithAuth.mockReset()
    toastError.mockReset()
    toastSuccess.mockReset()
    clipboardWriteText.mockReset()
    Object.defineProperty(navigator, 'clipboard', {
      configurable: true,
      value: { writeText: clipboardWriteText },
    })
  })

  it('トークン一覧の取得失敗を0件として表示しない', async () => {
    mockIntegrationsFetch({ apiTokenListError: true })
    renderIntegrationsSection()

    expect(await screen.findByText('⚠ APIトークンの取得に失敗しました')).toBeInTheDocument()
    expect(screen.queryByText('発行済みトークンはありません。')).not.toBeInTheDocument()
  })

  it('発行フォームの入力欄と選択欄へ共通スタイルを適用する', async () => {
    mockIntegrationsFetch()
    renderIntegrationsSection()

    expect(await screen.findByLabelText('トークン名')).toHaveClass('form-control')
    expect(screen.getByRole('combobox', { name: '権限' })).toHaveClass('form-control')
    expect(screen.getByRole('combobox', { name: '有効期間' })).toHaveClass('form-control')
  })

  it('取り消し済みのトークンを一覧に表示しない', async () => {
    mockIntegrationsFetch({
      apiTokens: [
        {
          id: 'active-token',
          name: 'Codex',
          prefix: 'cairn_pat_active',
          scope: 'read',
          expiresAt: '2027-08-05T00:00:00.000Z',
          revokedAt: null,
          lastUsedAt: null,
          createdAt: '2026-08-05T00:00:00.000Z',
        },
        {
          id: 'revoked-token',
          name: '取り消し済み',
          prefix: 'cairn_pat_revoked',
          scope: 'read',
          expiresAt: '2027-08-05T00:00:00.000Z',
          revokedAt: '2026-08-05T01:00:00.000Z',
          lastUsedAt: null,
          createdAt: '2026-08-05T00:00:00.000Z',
        },
      ],
    })
    renderIntegrationsSection()

    expect(await screen.findByText('Codex')).toBeInTheDocument()
    expect(screen.queryByText('取り消し済み')).not.toBeInTheDocument()
  })

  it('トークンの取り消し失敗を通知する', async () => {
    mockIntegrationsFetch({
      apiTokens: [
        {
          id: 'token-1',
          name: 'Claude',
          prefix: 'cairn_pat_12345678',
          scope: 'write',
          expiresAt: '2027-08-05T00:00:00.000Z',
          revokedAt: null,
          lastUsedAt: null,
          createdAt: '2026-08-05T00:00:00.000Z',
        },
      ],
      revokeError: true,
    })
    vi.spyOn(window, 'confirm').mockReturnValue(true)
    const user = userEvent.setup()
    renderIntegrationsSection()

    await user.click(await screen.findByRole('button', { name: '取り消す' }))

    await waitFor(() => {
      expect(toastError).toHaveBeenCalledWith('APIトークンの取り消しに失敗しました')
    })
  })

  it('クリップボードへの保存完了後だけコピー済みと表示する', async () => {
    mockIntegrationsFetch()
    let finishCopy: (() => void) | undefined
    clipboardWriteText.mockReturnValueOnce(
      new Promise<void>((resolve) => {
        finishCopy = resolve
      }),
    )
    const user = userEvent.setup()
    Object.defineProperty(navigator, 'clipboard', {
      configurable: true,
      value: { writeText: clipboardWriteText },
    })
    renderIntegrationsSection()

    await user.click(await screen.findByRole('button', { name: '発行' }))
    await screen.findByText('cairn_pat_secret')
    await user.click(screen.getAllByRole('button', { name: 'コピー' })[0]!)

    expect(screen.queryByRole('button', { name: 'コピー済み' })).not.toBeInTheDocument()
    finishCopy?.()
    expect(await screen.findByRole('button', { name: 'コピー済み' })).toBeInTheDocument()
    expect(toastSuccess).toHaveBeenCalledWith('APIトークンをコピーしました')
  })

  it('クリップボードへの保存失敗を通知する', async () => {
    mockIntegrationsFetch()
    clipboardWriteText.mockRejectedValueOnce(new Error('denied'))
    const user = userEvent.setup()
    Object.defineProperty(navigator, 'clipboard', {
      configurable: true,
      value: { writeText: clipboardWriteText },
    })
    renderIntegrationsSection()

    await user.click(await screen.findByRole('button', { name: '発行' }))
    await screen.findByText('cairn_pat_secret')
    await user.click(screen.getAllByRole('button', { name: 'コピー' })[0]!)

    await waitFor(() => {
      expect(toastError).toHaveBeenCalledWith('APIトークンをコピーできませんでした')
    })
    expect(screen.queryByRole('button', { name: 'コピー済み' })).not.toBeInTheDocument()
  })
})

describe('クレジットパック購入後の確認', () => {
  it('Checkoutの返却時は台帳記帳を確認できるまで残高を再取得する', () => {
    expect(
      resolveCreditPackFulfillmentPolling({
        isCreditPackReturn: true,
        sessionId: 'cs_credit_pack',
        fulfilled: false,
        startedAt: 0,
        now: 1,
      }),
    ).toBe('polling')
    expect(
      resolveCreditPackFulfillmentPolling({
        isCreditPackReturn: true,
        sessionId: 'cs_credit_pack',
        fulfilled: true,
        startedAt: 0,
        now: 1,
      }),
    ).toBe('fulfilled')
    expect(
      resolveCreditPackFulfillmentPolling({
        isCreditPackReturn: true,
        sessionId: 'cs_credit_pack',
        fulfilled: false,
        startedAt: 0,
        now: 60_000,
      }),
    ).toBe('timed_out')
  })
})

describe('モバイル設定のセクション', () => {
  it('請求を公開せず、決済を含まないケルン画面だけを公開する', () => {
    const ids = getSettingsNavGroups(false, { isMobile: true })
      .flatMap(group => group.items.map(item => item.id))

    expect(ids).not.toContain('billing')
    expect(ids).toContain('contributions')
    expect(isSettingsSection('billing', false, { isMobile: true })).toBe(false)
    expect(isSettingsSection('contributions', false, { isMobile: true })).toBe(true)
    expect(isSettingsSection('billing', false)).toBe(true)
  })
})
