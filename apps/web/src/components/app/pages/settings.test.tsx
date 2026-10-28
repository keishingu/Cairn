// Copyright 2026 Cairn Contributors
// SPDX-License-Identifier: Apache-2.0

import { fireEvent, render, screen, waitFor, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import React from 'react'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import type { CurrentUserDto } from '@/app/api/me/route'
import { CURRENT_USER_FETCH_ERROR_MESSAGE, CURRENT_USER_QUERY_KEY } from '@/hooks/use-current-user'
import {
  getSettingsNavGroups,
  isSettingsSection,
  resolveCreditPackFulfillmentPolling,
  SettingsSectionContent,
} from './settings'

const {
  fetchWithAuth,
  processImageForUpload,
  toastError,
  toastSuccess,
  clipboardWriteText,
  routerReplace,
  supabaseSignOut,
} = vi.hoisted(() => ({
  fetchWithAuth: vi.fn(),
  processImageForUpload: vi.fn(),
  toastError: vi.fn(),
  toastSuccess: vi.fn(),
  clipboardWriteText: vi.fn(),
  routerReplace: vi.fn(),
  supabaseSignOut: vi.fn(),
}))

vi.mock('next/navigation', () => ({
  usePathname: () => '/settings/account',
  useRouter: () => ({ push: vi.fn(), replace: routerReplace }),
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

vi.mock('@/lib/supabase/client', () => ({
  createClient: () => ({ auth: { signOut: supabaseSignOut } }),
}))

vi.mock('../login-methods-settings', () => ({
  LoginMethodsSettings: () => null,
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

  return {
    queryClient,
    ...render(
      <QueryClientProvider client={queryClient}>
        <SettingsSectionContent section="account" />
      </QueryClientProvider>,
    ),
  }
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
  oauthConnections?: unknown[]
  oauthRevokeError?: boolean
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
    if (input === '/api/oauth/connections' && !init) {
      return new Response(JSON.stringify(options?.oauthConnections ?? []))
    }
    if (input.startsWith('/api/oauth/connections/') && init?.method === 'DELETE') {
      return options?.oauthRevokeError
        ? new Response(JSON.stringify({ error: 'failed' }), { status: 500 })
        : new Response(null, { status: 204 })
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
    routerReplace.mockReset()
    supabaseSignOut.mockReset()
    supabaseSignOut.mockResolvedValue({ error: null })
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

      if (input === '/api/me/account' && init?.method === 'DELETE') {
        return {
          ok: true,
          json: async () => ({ deleted: true }),
        }
      }

      throw new Error(`unexpected fetch: ${input}`)
    })
  })

  it('確認入力後にアカウントを削除しExpo側のセッション破棄も通知する', async () => {
    const user = userEvent.setup()
    const nativePostMessage = vi.fn()
    Object.defineProperty(window, 'ReactNativeWebView', {
      configurable: true,
      value: { postMessage: nativePostMessage },
    })

    renderAccountSection()
    await screen.findByText('山田 太郎')

    await user.click(screen.getByRole('button', { name: 'アカウントを削除' }))
    const confirmButton = screen.getByRole('button', { name: '完全に削除する' })
    expect(confirmButton).toBeDisabled()

    await user.type(screen.getByLabelText('アカウント削除の確認'), '削除')
    expect(confirmButton).toBeEnabled()
    await user.click(confirmButton)

    await waitFor(() => {
      expect(fetchWithAuth).toHaveBeenCalledWith(
        '/api/me/account',
        expect.objectContaining({
          method: 'DELETE',
          body: JSON.stringify({ confirmation: '削除' }),
        }),
      )
      expect(nativePostMessage).toHaveBeenCalledWith(JSON.stringify({ type: 'account-deleted' }))
      expect(supabaseSignOut).toHaveBeenCalledWith({ scope: 'local' })
      expect(routerReplace).toHaveBeenCalledWith('/auth/login?accountDeleted=1')
    })
  })

  it('表示名の保存後に共有キャッシュへ新しい名前を反映する', async () => {
    const user = userEvent.setup()
    let displayName = '山田 太郎'
    fetchWithAuth.mockImplementation(async (input: string, init?: RequestInit) => {
      if (input === '/api/me' && !init?.method) {
        return {
          ok: true,
          json: async () => ({
            id: 'user-1',
            displayName,
            email: 'taro@example.com',
            avatarUrl: null,
            wsRole: 'member',
          }),
        }
      }
      if (input === '/api/me' && init?.method === 'PATCH') {
        displayName = (JSON.parse(String(init.body)) as { displayName: string }).displayName
        return { ok: true, json: async () => ({}) }
      }
      throw new Error(`unexpected fetch: ${input}`)
    })

    const { queryClient } = renderAccountSection()
    await screen.findByDisplayValue('山田 太郎')

    const input = screen.getByDisplayValue('山田 太郎')
    await user.clear(input)
    await user.type(input, '新しい名前')
    await user.click(screen.getByRole('button', { name: '保存' }))

    await screen.findByText('新しい名前')
    await waitFor(() => {
      expect(queryClient.getQueryData<CurrentUserDto>(CURRENT_USER_QUERY_KEY)?.displayName).toBe('新しい名前')
    })
  })

  it('ユーザー情報の取得失敗を表示する', async () => {
    fetchWithAuth.mockImplementation(async () => ({
      ok: false,
      status: 500,
      json: async () => ({ error: 'failed' }),
    }))

    renderAccountSection()

    expect(await screen.findByText(CURRENT_USER_FETCH_ERROR_MESSAGE)).toBeInTheDocument()
    expect(screen.queryByText('山田 太郎')).toBeNull()
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
      expect(fetchWithAuth).toHaveBeenCalledWith(
        '/api/me/avatar',
        expect.objectContaining({
          method: 'POST',
          body: expect.any(FormData),
        }),
      )
    })

    const avatarCall = fetchWithAuth.mock.calls.find((call) => call[0] === '/api/me/avatar')
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
      expect(
        screen.getByText(
          'アニメーション画像のアバターには未対応です。静止 JPEG / PNG / WebP / HEIC を選んでください',
        ),
      ).toBeInTheDocument()
    })

    expect(processImageForUpload).not.toHaveBeenCalled()
    expect(fetchWithAuth).not.toHaveBeenCalledWith('/api/me/avatar', expect.anything())
  })

  it('animated WebP アバターはアップロード前に弾く', async () => {
    const webpBytes = new Uint8Array([
      0x52, 0x49, 0x46, 0x46, 0x1e, 0x00, 0x00, 0x00, 0x57, 0x45, 0x42, 0x50, 0x56, 0x50, 0x38,
      0x58, 0x0a, 0x00, 0x00, 0x00, 0x02, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00,
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
      expect(
        screen.getByText(
          'アニメーション画像のアバターには未対応です。静止 JPEG / PNG / WebP / HEIC を選んでください',
        ),
      ).toBeInTheDocument()
    })

    expect(processImageForUpload).not.toHaveBeenCalled()
    expect(fetchWithAuth).not.toHaveBeenCalledWith('/api/me/avatar', expect.anything())
  })

  it('APNG アバターはアップロード前に弾く', async () => {
    const apngBytes = new Uint8Array([
      0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a, 0x00, 0x00, 0x00, 0x08, 0x61, 0x63, 0x54,
      0x4c, 0x00, 0x00, 0x00, 0x02, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00,
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
      expect(
        screen.getByText(
          'アニメーション画像のアバターには未対応です。静止 JPEG / PNG / WebP / HEIC を選んでください',
        ),
      ).toBeInTheDocument()
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

    expect(await screen.findByText('APIトークンの取得に失敗しました')).toBeInTheDocument()
    expect(screen.queryByText('発行済みトークンはありません。')).not.toBeInTheDocument()
  })

  it('OAuth接続を一覧表示し、取り消し後に非表示にする', async () => {
    mockIntegrationsFetch({
      oauthConnections: [
        {
          id: 'connection-1',
          clientName: 'Claude',
          scope: 'write',
          createdAt: '2026-08-05T00:00:00.000Z',
        },
      ],
    })
    const user = userEvent.setup()
    renderIntegrationsSection()

    expect(await screen.findByText('Claude')).toBeInTheDocument()
    expect(screen.getByText(/読み取り・書き込み/)).toBeInTheDocument()
    await user.click(screen.getByRole('button', { name: '取り消す' }))
    const dialog = screen.getByRole('alertdialog')
    await user.click(within(dialog).getByRole('button', { name: '取り消す' }))

    await waitFor(() => expect(screen.queryByText('Claude')).not.toBeInTheDocument())
    expect(toastSuccess).toHaveBeenCalledWith('OAuth接続を取り消しました')
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
    const user = userEvent.setup()
    renderIntegrationsSection()

    await user.click(await screen.findByRole('button', { name: '取り消す' }))
    const dialog = screen.getByRole('alertdialog')
    await user.click(within(dialog).getByRole('button', { name: '取り消す' }))

    // 失敗時はダイアログを開いたまま理由を表示する
    expect(await within(dialog).findByRole('alert')).toHaveTextContent('APIトークンの取り消しに失敗しました')
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
    // 成功はボタン自身の表示で返し、トーストは重ねない
    expect(toastSuccess).not.toHaveBeenCalled()
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

describe('外観の言語設定', () => {
  it('英語を選ぶとプロフィールへ言語設定を保存する', async () => {
    const user = userEvent.setup()
    fetchWithAuth.mockImplementation(async (input: string, init?: RequestInit) => {
      if (input === '/api/me' && init?.method === 'PATCH') {
        return { ok: true, json: async () => ({}) }
      }
      return { ok: true, json: async () => ({ id: 'user-1', locale: 'system', calendarWeekStart: 'sunday' }) }
    })

    const queryClient = new QueryClient({
      defaultOptions: { queries: { retry: false }, mutations: { retry: false } },
    })
    render(
      <QueryClientProvider client={queryClient}>
        <SettingsSectionContent section="appearance" />
      </QueryClientProvider>,
    )

    await user.click(await screen.findByRole('button', { name: 'English' }))

    await waitFor(() => {
      expect(fetchWithAuth).toHaveBeenCalledWith(
        '/api/me',
        expect.objectContaining({
          method: 'PATCH',
          body: JSON.stringify({ locale: 'en' }),
        }),
      )
    })
  })

  it('韓国語を選ぶとプロフィールへ言語設定を保存する', async () => {
    const user = userEvent.setup()
    fetchWithAuth.mockImplementation(async (input: string, init?: RequestInit) => {
      if (input === '/api/me' && init?.method === 'PATCH') {
        return { ok: true, json: async () => ({}) }
      }
      return { ok: true, json: async () => ({ id: 'user-1', locale: 'system', calendarWeekStart: 'sunday' }) }
    })

    const queryClient = new QueryClient({
      defaultOptions: { queries: { retry: false }, mutations: { retry: false } },
    })
    render(
      <QueryClientProvider client={queryClient}>
        <SettingsSectionContent section="appearance" />
      </QueryClientProvider>,
    )

    await user.click(await screen.findByRole('button', { name: '한국어' }))

    await waitFor(() => {
      expect(fetchWithAuth).toHaveBeenCalledWith(
        '/api/me',
        expect.objectContaining({
          method: 'PATCH',
          body: JSON.stringify({ locale: 'ko' }),
        }),
      )
    })
  })
})

describe('外観の週の始まり', () => {
  it('月曜を選ぶとプロフィールへ保存する', async () => {
    const user = userEvent.setup()
    fetchWithAuth.mockImplementation(async (input: string, init?: RequestInit) => {
      if (input === '/api/me' && !init) {
        return {
          ok: true,
          json: async () => ({
            id: 'user-1',
            displayName: '山田 太郎',
            email: 'taro@example.com',
            avatarUrl: null,
            theme: 'system',
            accentId: 'emerald',
            locale: 'system',
            calendarWeekStart: 'sunday',
          }),
        }
      }
      if (input === '/api/me' && init?.method === 'PATCH') {
        return { ok: true, json: async () => ({ id: 'user-1', calendarWeekStart: 'monday' }) }
      }
      throw new Error(`unexpected fetch: ${input}`)
    })

    const queryClient = new QueryClient({ defaultOptions: { queries: { retry: false } } })
    render(
      <QueryClientProvider client={queryClient}>
        <SettingsSectionContent section="appearance" />
      </QueryClientProvider>,
    )

    const monday = await screen.findByRole('button', { name: '月曜' })
    await waitFor(() => expect(monday).toBeEnabled())
    await user.click(monday)

    await waitFor(() => {
      expect(fetchWithAuth).toHaveBeenCalledWith('/api/me', expect.objectContaining({
        method: 'PATCH',
        body: JSON.stringify({ calendarWeekStart: 'monday' }),
      }))
    })
    expect(window.localStorage.getItem('cairn:calendar_week_start')).toBe('monday')
  })
})

describe('モバイル設定のセクション', () => {
  it('請求を公開せず、決済を含まないケルン画面だけを公開する', () => {
    const ids = getSettingsNavGroups(false, { isMobile: true }).flatMap((group) =>
      group.items.map((item) => item.id),
    )

    expect(ids).not.toContain('billing')
    expect(ids).toContain('contributions')
    expect(isSettingsSection('billing', false, { isMobile: true })).toBe(false)
    expect(isSettingsSection('contributions', false, { isMobile: true })).toBe(true)
    expect(isSettingsSection('billing', false)).toBe(true)
  })
})

describe('AIオートメーションの設定セクション', () => {
  it('一覧を見られないゲストには項目を出さず、URLを直接開いても既定の画面にする', () => {
    expect(isSettingsSection('automations', false, { isGuest: true })).toBe(false)
    expect(isSettingsSection('automations', false, { isMobile: true, isGuest: true })).toBe(false)
    expect(isSettingsSection('automations', false)).toBe(true)
  })
})

describe('AIエージェントのモデル選択', () => {
  function renderAiSection(wsRole: 'owner' | 'member') {
    fetchWithAuth.mockImplementation(async (input: string, init?: RequestInit) => {
      if (input === '/api/me' && !init) {
        return new Response(JSON.stringify({ id: USER_ID, wsRole }))
      }
      if (input === '/api/workspaces/settings' && !init) {
        return new Response(JSON.stringify({ aiChatModel: 'gpt-5' }))
      }
      if (input === '/api/workspaces/settings' && init?.method === 'PATCH') {
        return new Response(JSON.stringify({ aiChatModel: 'claude-sonnet-5-5' }))
      }
      return new Response(JSON.stringify({}))
    })
    const queryClient = new QueryClient({
      defaultOptions: { queries: { retry: false }, mutations: { retry: false } },
    })
    return render(
      <QueryClientProvider client={queryClient}>
        <SettingsSectionContent section="ai" />
      </QueryClientProvider>,
    )
  }

  beforeEach(() => {
    fetchWithAuth.mockReset()
  })

  it('ワークスペースの設定値を選択中として表示し、Claude を選ぶと保存する', async () => {
    renderAiSection('owner')

    const gpt = await screen.findByRole('radio', { name: /GPT-5/ })
    await waitFor(() => expect(gpt).toHaveAttribute('aria-checked', 'true'))
    const sonnet = screen.getByRole('radio', { name: /Claude Sonnet 5\.5/ })
    await waitFor(() => expect(sonnet).toBeEnabled())

    fireEvent.click(sonnet)

    await waitFor(() =>
      expect(fetchWithAuth).toHaveBeenCalledWith(
        '/api/workspaces/settings',
        expect.objectContaining({ method: 'PATCH', body: JSON.stringify({ aiChatModel: 'claude-sonnet-5-5' }) }),
      ),
    )
    await waitFor(() => expect(sonnet).toHaveAttribute('aria-checked', 'true'))
  })

  it('owner 以外はモデルを変更できない', async () => {
    renderAiSection('member')

    const gpt = await screen.findByRole('radio', { name: /GPT-5/ })
    await waitFor(() => expect(gpt).toHaveAttribute('aria-checked', 'true'))
    expect(screen.getByRole('radio', { name: /Claude Opus 5\.5/ })).toBeDisabled()
  })
})

describe('AIエージェントのシステムプロンプト', () => {
  function renderAiSection(wsRole: 'owner' | 'member', patchResponse?: Response) {
    fetchWithAuth.mockImplementation(async (input: string, init?: RequestInit) => {
      if (input === '/api/me' && !init) {
        return new Response(JSON.stringify({ id: USER_ID, wsRole }))
      }
      if (input === '/api/workspaces/settings' && !init) {
        return new Response(JSON.stringify({ aiChatModel: 'gpt-5', aiChatSystemPrompt: '敬体で答える' }))
      }
      if (input === '/api/workspaces/settings' && init?.method === 'PATCH') {
        const body = JSON.parse(String(init.body))
        return patchResponse ?? new Response(JSON.stringify({
          aiChatModel: body.aiChatModel ?? 'gpt-5',
          aiChatSystemPrompt: 'aiChatSystemPrompt' in body ? (body.aiChatSystemPrompt.trim() || null) : '敬体で答える',
        }))
      }
      return new Response(JSON.stringify({}))
    })
    const queryClient = new QueryClient({
      defaultOptions: { queries: { retry: false }, mutations: { retry: false } },
    })
    return render(
      <QueryClientProvider client={queryClient}>
        <SettingsSectionContent section="ai" />
      </QueryClientProvider>,
    )
  }

  beforeEach(() => {
    fetchWithAuth.mockReset()
  })

  it('保存済みのプロンプトを表示し、owner が編集して保存できる', async () => {
    renderAiSection('owner')

    const textarea = await screen.findByRole('textbox', { name: 'システムプロンプト' })
    await waitFor(() => expect(textarea).toHaveValue('敬体で答える'))
    const save = screen.getByRole('button', { name: '保存' })
    expect(save).toBeDisabled()

    fireEvent.change(textarea, { target: { value: 'タスクはチケットと呼ぶ' } })
    await waitFor(() => expect(save).toBeEnabled())
    fireEvent.click(save)

    await waitFor(() =>
      expect(fetchWithAuth).toHaveBeenCalledWith(
        '/api/workspaces/settings',
        expect.objectContaining({ method: 'PATCH', body: JSON.stringify({ aiChatSystemPrompt: 'タスクはチケットと呼ぶ' }) }),
      ),
    )
    expect(await screen.findByRole('button', { name: '保存済み' })).toBeInTheDocument()
  })

  it('保存前にモデルを変えても、編集中のプロンプトを消さない', async () => {
    renderAiSection('owner')

    const textarea = await screen.findByRole('textbox', { name: 'システムプロンプト' })
    await waitFor(() => expect(textarea).toHaveValue('敬体で答える'))
    fireEvent.change(textarea, { target: { value: '未保存の編集' } })
    const opus = screen.getByRole('radio', { name: /Claude Opus 5\.5/ })
    await waitFor(() => expect(opus).toBeEnabled())
    fireEvent.click(opus)

    await waitFor(() =>
      expect(fetchWithAuth).toHaveBeenCalledWith(
        '/api/workspaces/settings',
        expect.objectContaining({ method: 'PATCH', body: JSON.stringify({ aiChatModel: 'claude-opus-5-5' }) }),
      ),
    )
    await waitFor(() => expect(opus).toHaveAttribute('aria-checked', 'true'))
    expect(textarea).toHaveValue('未保存の編集')
  })

  it('保存後はサーバーが整形した値を表示し、空白だけなら空欄に戻す', async () => {
    renderAiSection('owner')

    const textarea = await screen.findByRole('textbox', { name: 'システムプロンプト' })
    await waitFor(() => expect(textarea).toHaveValue('敬体で答える'))
    const save = screen.getByRole('button', { name: '保存' })

    fireEvent.change(textarea, { target: { value: '  前後に空白  ' } })
    await waitFor(() => expect(save).toBeEnabled())
    fireEvent.click(save)
    await waitFor(() => expect(textarea).toHaveValue('前後に空白'))

    fireEvent.change(textarea, { target: { value: '   ' } })
    fireEvent.click(await screen.findByRole('button', { name: /保存/ }))
    await waitFor(() => expect(textarea).toHaveValue(''))
  })

  it('入力欄は共通のフォーム部品として、フォーカス表示を消さない', async () => {
    renderAiSection('owner')

    const textarea = await screen.findByRole('textbox', { name: 'システムプロンプト' })
    expect(textarea).toHaveClass('form-control')
    expect(textarea.style.outline).toBe('')
  })

  it('プロンプト保存後のモデル変更の応答が古いプロンプトを含んでいても、保存した内容を表示し続ける', async () => {
    renderAiSection('owner')

    const textarea = await screen.findByRole('textbox', { name: 'システムプロンプト' })
    await waitFor(() => expect(textarea).toHaveValue('敬体で答える'))
    fireEvent.change(textarea, { target: { value: '新しいプロンプト' } })
    fireEvent.click(screen.getByRole('button', { name: '保存' }))
    await screen.findByRole('button', { name: '保存済み' })

    // モデルだけの PATCH の応答は、テストのモックでは古いプロンプト（敬体で答える）を返す
    const opus = screen.getByRole('radio', { name: /Claude Opus 5\.5/ })
    fireEvent.click(opus)
    await waitFor(() => expect(opus).toHaveAttribute('aria-checked', 'true'))

    expect(textarea).toHaveValue('新しいプロンプト')
  })

  it('設定の読み込みに失敗したらエラーを表示し、再試行できる', async () => {
    let failing = true
    fetchWithAuth.mockImplementation(async (input: string, init?: RequestInit) => {
      if (input === '/api/me' && !init) return new Response(JSON.stringify({ id: USER_ID, wsRole: 'owner' }))
      if (input === '/api/workspaces/settings' && !init) {
        return failing
          ? new Response(JSON.stringify({ error: 'failed' }), { status: 500 })
          : new Response(JSON.stringify({ aiChatModel: 'gpt-5', aiChatSystemPrompt: '敬体で答える' }))
      }
      return new Response(JSON.stringify({}))
    })
    const queryClient = new QueryClient({
      defaultOptions: { queries: { retry: false }, mutations: { retry: false } },
    })
    render(
      <QueryClientProvider client={queryClient}>
        <SettingsSectionContent section="ai" />
      </QueryClientProvider>,
    )

    expect(await screen.findByText(/AIエージェントの設定を読み込めませんでした。/)).toBeInTheDocument()
    failing = false
    fireEvent.click(screen.getByRole('button', { name: '再試行' }))

    await waitFor(() => expect(screen.getByRole('textbox', { name: 'システムプロンプト' })).toHaveValue('敬体で答える'))
    expect(screen.queryByText(/AIエージェントの設定を読み込めませんでした。/)).not.toBeInTheDocument()
  })

  it('保存中や保存直後に書き足した内容は「保存済み」と表示せず、下書きとして残す', async () => {
    let resolvePatch: (response: Response) => void = () => {}
    renderAiSection('owner')
    fetchWithAuth.mockImplementation(async (input: string, init?: RequestInit) => {
      if (input === '/api/me' && !init) return new Response(JSON.stringify({ id: USER_ID, wsRole: 'owner' }))
      if (input === '/api/workspaces/settings' && init?.method === 'PATCH') {
        return new Promise<Response>((resolve) => { resolvePatch = resolve })
      }
      if (input === '/api/workspaces/settings') {
        return new Response(JSON.stringify({ aiChatModel: 'gpt-5', aiChatSystemPrompt: '敬体で答える' }))
      }
      return new Response(JSON.stringify({}))
    })

    const textarea = await screen.findByRole('textbox', { name: 'システムプロンプト' })
    await waitFor(() => expect(textarea).toHaveValue('敬体で答える'))
    fireEvent.change(textarea, { target: { value: '送信した内容' } })
    fireEvent.click(screen.getByRole('button', { name: '保存' }))
    await waitFor(() => expect(fetchWithAuth).toHaveBeenCalledWith('/api/workspaces/settings', expect.objectContaining({ method: 'PATCH' })))

    fireEvent.change(textarea, { target: { value: '送信した内容と書き足し' } })
    resolvePatch(new Response(JSON.stringify({ aiChatModel: 'gpt-5', aiChatSystemPrompt: '送信した内容' })))

    await waitFor(() => expect(screen.getByRole('button', { name: '保存' })).toBeEnabled())
    expect(textarea).toHaveValue('送信した内容と書き足し')
    expect(screen.queryByRole('button', { name: '保存済み' })).not.toBeInTheDocument()
  })

  it('保存直後に編集したら「保存済み」の表示を消す', async () => {
    renderAiSection('owner')

    const textarea = await screen.findByRole('textbox', { name: 'システムプロンプト' })
    await waitFor(() => expect(textarea).toHaveValue('敬体で答える'))
    fireEvent.change(textarea, { target: { value: '保存する内容' } })
    fireEvent.click(screen.getByRole('button', { name: '保存' }))
    await screen.findByRole('button', { name: '保存済み' })

    fireEvent.change(textarea, { target: { value: '保存する内容と追記' } })

    expect(screen.queryByRole('button', { name: '保存済み' })).not.toBeInTheDocument()
    expect(screen.getByRole('button', { name: '保存' })).toBeEnabled()
  })

  it('owner 以外は読み取り専用で、保存できない', async () => {
    renderAiSection('member')

    const textarea = await screen.findByRole('textbox', { name: 'システムプロンプト' })
    await waitFor(() => expect(textarea).toHaveValue('敬体で答える'))
    expect(textarea).toHaveAttribute('readonly')
    expect(screen.getByText(/編集できるのはワークスペースのオーナーだけです。/)).toBeInTheDocument()
    expect(screen.getByRole('button', { name: '保存' })).toBeDisabled()
  })

  it('保存に失敗したらエラーを表示する', async () => {
    renderAiSection('owner', new Response(JSON.stringify({ error: 'failed' }), { status: 500 }))

    const textarea = await screen.findByRole('textbox', { name: 'システムプロンプト' })
    await waitFor(() => expect(textarea).toHaveValue('敬体で答える'))
    fireEvent.change(textarea, { target: { value: '変更' } })
    const save = screen.getByRole('button', { name: '保存' })
    await waitFor(() => expect(save).toBeEnabled())
    fireEvent.click(save)

    expect(await screen.findByText('Failed to update workspace settings')).toBeInTheDocument()
  })
})
