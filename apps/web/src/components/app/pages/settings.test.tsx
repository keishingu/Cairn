// Copyright 2026 Cairn Contributors
// SPDX-License-Identifier: Apache-2.0

import { render, screen, waitFor } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import React from 'react'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import { SettingsSectionContent } from './settings'

const { fetchWithAuth, processImageForUpload } = vi.hoisted(() => ({
  fetchWithAuth: vi.fn(),
  processImageForUpload: vi.fn(),
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

describe('SettingsSectionContent', () => {
  beforeEach(() => {
    fetchWithAuth.mockReset()
    processImageForUpload.mockReset()

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

    await userEvent.upload(input as HTMLInputElement, originalFile)

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
})
