// Copyright 2026 Cairn Contributors
// SPDX-License-Identifier: Apache-2.0

import { renderHook, waitFor } from '@testing-library/react'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import React from 'react'
import { beforeEach, describe, expect, it, vi } from 'vitest'

const { fetchWithAuth } = vi.hoisted(() => ({ fetchWithAuth: vi.fn() }))
vi.mock('@/lib/fetch-with-auth', () => ({ fetchWithAuth }))

import { useBillingAiUsage } from './use-billing-ai-usage'

function makeWrapper() {
  const queryClient = new QueryClient({ defaultOptions: { queries: { retry: false } } })
  const Wrapper = ({ children }: { children: React.ReactNode }) =>
    React.createElement(QueryClientProvider, { client: queryClient }, children)
  return Wrapper
}

describe('useBillingAiUsage', () => {
  beforeEach(() => {
    fetchWithAuth.mockReset()
  })

  it('今月のAIの利用を取得する', async () => {
    const body = { billingEnabled: true, periodStart: '2026-10-31T15:00:00.000Z', mine: { requests: 0, credits: 0, items: [] }, workspace: null }
    fetchWithAuth.mockResolvedValue(new Response(JSON.stringify(body)))

    const { result } = renderHook(() => useBillingAiUsage(), { wrapper: makeWrapper() })

    await waitFor(() => expect(result.current.isSuccess).toBe(true))
    expect(fetchWithAuth).toHaveBeenCalledWith('/api/billing/ai-usage')
    expect(result.current.data).toEqual(body)
  })

  it('取得に失敗したら0として扱わずエラーにする', async () => {
    fetchWithAuth.mockResolvedValue(new Response(JSON.stringify({ error: 'failed' }), { status: 500 }))

    const { result } = renderHook(() => useBillingAiUsage(), { wrapper: makeWrapper() })

    await waitFor(() => expect(result.current.isError).toBe(true))
    expect(result.current.error?.message).toBe('Could not load AI usage')
  })
})
