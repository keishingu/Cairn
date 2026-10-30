// Copyright 2026 Cairn Contributors
// SPDX-License-Identifier: Apache-2.0

import { act, renderHook, waitFor } from '@testing-library/react'
import { describe, expect, it, vi } from 'vitest'
import { sendBlocker, useAiAttachments, type PendingAiAttachment } from './use-ai-attachments'

const fetchWithAuth = vi.hoisted(() => vi.fn())
vi.mock('@/lib/fetch-with-auth', () => ({ fetchWithAuth }))
vi.mock('@/lib/supabase/client', () => ({
  createClient: () => ({ storage: { from: () => ({ uploadToSignedUrl: async () => ({ error: null }) }) } }),
}))

describe('送れるかの判定', () => {
  const item = (state: PendingAiAttachment['state']): PendingAiAttachment => ({ localId: crypto.randomUUID(), fileName: 'a.csv', mimeType: 'text/csv', state })

  it('どの添付も送れる状態なら送れ、ひとつでも途中・失敗の添付があれば送らない', () => {
    expect(sendBlocker([])).toBeNull()
    expect(sendBlocker([item({ kind: 'ready', attachmentId: 'a' })])).toBeNull()
    expect(sendBlocker([item({ kind: 'ready', attachmentId: 'a' }), item({ kind: 'uploading' })])).toBe('uploading')
    expect(sendBlocker([item({ kind: 'removing', attachmentId: 'a' })])).toBe('removing')
    expect(sendBlocker([item({ kind: 'upload-failed', attachmentId: null, error: 'x' })])).toBe('failed')
    expect(sendBlocker([item({ kind: 'remove-failed', attachmentId: 'a', error: 'x' })])).toBe('failed')
  })
})

describe('送信前の添付を外す', () => {
  const json = (body: unknown, status = 200) => new Response(JSON.stringify(body), { status, headers: { 'Content-Type': 'application/json' } })
  const ATTACHMENT_ID = '11111111-1111-4111-8111-111111111111'
  const created = () => json({ attachmentId: ATTACHMENT_ID, path: 'p', token: 't', mimeType: 'text/csv' })

  it('外している途中は送らせず、消せなければ残して送らせず、もう一度外すと消える', async () => {
    fetchWithAuth.mockImplementation(async (_url: string, init?: RequestInit) => (init?.method === 'POST' ? created() : json({}, 500)))
    const { result } = renderHook(() => useAiAttachments('c1'))
    await act(async () => { await result.current.add([new File(['a,b'], 'memo.csv', { type: 'text/csv' })]) })
    await waitFor(() => expect(result.current.pending[0]?.state.kind).toBe('ready'))
    expect(result.current.blocker).toBeNull()

    let finishRemoval: (res: Response) => void = () => undefined
    fetchWithAuth.mockImplementation(() => new Promise<Response>(resolve => { finishRemoval = resolve }))
    let removal: Promise<void> = Promise.resolve()
    act(() => { removal = result.current.remove(result.current.pending[0]!.localId) })
    await waitFor(() => expect(result.current.blocker).toBe('removing'))
    await act(async () => {
      finishRemoval(json({ error: 'failed' }, 500))
      await removal
    })
    expect(result.current.pending[0]?.state.kind).toBe('remove-failed')
    expect(result.current.blocker).toBe('failed')
    expect(result.current.notice).toBe('memo.csv を外せませんでした。もう一度お試しください')

    fetchWithAuth.mockImplementation(async () => new Response(null, { status: 204 }))
    await act(async () => { await result.current.remove(result.current.pending[0]!.localId) })
    expect(result.current.pending).toHaveLength(0)
    expect(result.current.blocker).toBeNull()
  })

  it('アップロードの途中で外すと、行ができた時点でサーバーから消す', async () => {
    let finishCreate: (res: Response) => void = () => undefined
    const deletes: string[] = []
    fetchWithAuth.mockImplementation((url: string, init?: RequestInit) => {
      if (init?.method === 'POST') return new Promise<Response>(resolve => { finishCreate = resolve })
      deletes.push(url)
      return Promise.resolve(new Response(null, { status: 204 }))
    })
    const { result } = renderHook(() => useAiAttachments('c1'))
    await act(async () => { await result.current.add([new File(['a,b'], 'memo.csv', { type: 'text/csv' })]) })
    await act(async () => { await result.current.remove(result.current.pending[0]!.localId) })
    expect(result.current.pending).toHaveLength(0)

    await act(async () => { finishCreate(created()) })
    await waitFor(() => expect(deletes).toEqual([`/api/ai/conversations/c1/attachments/${ATTACHMENT_ID}`]))
  })

  it('送信すると準備のできた添付を取り出し、送信に失敗したら入力欄へ戻す', async () => {
    fetchWithAuth.mockImplementation(async () => created())
    const { result } = renderHook(() => useAiAttachments('c1'))
    await act(async () => { await result.current.add([new File(['a,b'], 'memo.csv', { type: 'text/csv' })]) })
    await waitFor(() => expect(result.current.pending[0]?.state.kind).toBe('ready'))

    let taken: ReturnType<typeof result.current.takeForSend> | null = null
    act(() => { taken = result.current.takeForSend() })
    expect(taken!.attachmentIds).toEqual([ATTACHMENT_ID])
    expect(result.current.pending).toHaveLength(0)

    act(() => { result.current.restoreLastSent() })
    expect(result.current.pending.map(item => item.state.kind)).toEqual(['ready'])
  })

  it('画像のプレビュー URL は、外したときと保存した添付に置き換わったときに解放する', async () => {
    // jsdom には blob URL の作成・解放が無いため用意する
    let count = 0
    const revoked = vi.fn()
    Object.assign(URL, { createObjectURL: () => `blob:preview-${++count}`, revokeObjectURL: revoked })
    fetchWithAuth.mockImplementation(async (_url: string, init?: RequestInit) => (init?.method === 'POST' ? created_() : new Response(null, { status: 204 })))
    function created_() {
      return json({ attachmentId: ATTACHMENT_ID, path: 'p', token: 't', mimeType: 'image/png' })
    }
    const png = () => new File([new Uint8Array([0x89, 0x50, 0x4e, 0x47])], 'map.png', { type: 'image/png' })
    const { result } = renderHook(() => useAiAttachments('c1'))

    await act(async () => { await result.current.add([png()]) })
    await waitFor(() => expect(result.current.pending[0]?.state.kind).toBe('ready'))
    await act(async () => { await result.current.remove(result.current.pending[0]!.localId) })
    expect(revoked).toHaveBeenCalledWith('blob:preview-1')

    await act(async () => { await result.current.add([png()]) })
    await waitFor(() => expect(result.current.pending[0]?.state.kind).toBe('ready'))
    act(() => { result.current.takeForSend() })
    expect(revoked).not.toHaveBeenCalledWith('blob:preview-2')
    act(() => { result.current.releaseSentPreviews() })
    expect(revoked).toHaveBeenCalledWith('blob:preview-2')

  })
})

