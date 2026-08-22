// Copyright 2026 Cairn Contributors
// SPDX-License-Identifier: Apache-2.0

import { render, screen } from '@testing-library/react'
import { beforeEach, describe, expect, test, vi } from 'vitest'
import LoginPage from './page'

const mocks = vi.hoisted(() => ({
  searchParams: new URLSearchParams(),
}))

vi.mock('next/navigation', () => ({
  useRouter: () => ({ push: vi.fn(), refresh: vi.fn() }),
  useSearchParams: () => mocks.searchParams,
}))

describe('LoginPage', () => {
  beforeEach(() => {
    mocks.searchParams = new URLSearchParams('error=callback')
  })

  test('OAuthコールバックの失敗を再試行可能な日本語エラーで表示する', async () => {
    render(<LoginPage />)

    expect(await screen.findByRole('alert')).toHaveTextContent(
      'サインインを完了できませんでした。もう一度お試しください。',
    )
  })
})
