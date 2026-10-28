// Copyright 2026 Cairn Contributors
// SPDX-License-Identifier: Apache-2.0

import React from 'react'
import { act, render, renderHook, screen, waitFor } from '@testing-library/react'
import { describe, expect, it, vi } from 'vitest'
import { ATTACHMENT_URL_UNAVAILABLE, SentAttachments, toDisplayAttachments, useAiAttachments } from './ai-attachments'

const fetchWithAuth = vi.hoisted(() => vi.fn())
vi.mock('@/lib/fetch-with-auth', () => ({ fetchWithAuth }))
vi.mock('@/lib/supabase/client', () => ({
  createClient: () => ({ storage: { from: () => ({ uploadToSignedUrl: async () => ({ error: null }) }) } }),
}))

describe('送信済みの添付の表示', () => {
  it('リンクを発行できなかった添付は、開けないことを表示してリンクにしない', () => {
    const attachments = toDisplayAttachments([
      { fileName: '予算.pdf', mimeType: 'application/pdf', url: 'https://storage/a' },
      { fileName: '地図.png', mimeType: 'image/png', url: null },
    ])
    expect(attachments[1]?.url).toBe(ATTACHMENT_URL_UNAVAILABLE)

    render(<SentAttachments attachments={attachments}/>)
    expect(screen.getByRole('link')).toHaveAttribute('href', 'https://storage/a')
    expect(screen.getByRole('alert')).toHaveTextContent('リンクを取得できませんでした')
    expect(screen.getByText('地図.png')).toBeInTheDocument()
  })
})

describe('送信前の添付を外す', () => {
  const json = (body: unknown, status = 200) => new Response(JSON.stringify(body), { status, headers: { 'Content-Type': 'application/json' } })

  it('サーバーから消せなければ、添付を表示に残してエラーを出し、もう一度外せる', async () => {
    fetchWithAuth.mockImplementation(async (_url: string, init?: RequestInit) => {
      if (init?.method === 'POST') return json({ attachmentId: '11111111-1111-4111-8111-111111111111', path: 'p', token: 't', mimeType: 'text/csv' })
      return json({ error: 'failed' }, 500)
    })
    const { result } = renderHook(() => useAiAttachments('c1'))
    await act(async () => { await result.current.add([new File(['a,b'], 'memo.csv', { type: 'text/csv' })]) })
    await waitFor(() => expect(result.current.pending[0]?.status).toBe('ready'))

    await act(async () => { await result.current.remove(result.current.pending[0]!.localId) })
    expect(result.current.pending).toHaveLength(1)
    expect(result.current.notice).toBe('memo.csv を外せませんでした。もう一度お試しください')

    fetchWithAuth.mockImplementation(async () => new Response(null, { status: 204 }))
    await act(async () => { await result.current.remove(result.current.pending[0]!.localId) })
    expect(result.current.pending).toHaveLength(0)
  })
})

