import { describe, expect, it, vi } from 'vitest'

const apiFetch = vi.hoisted(() => vi.fn())
vi.mock('./api-fetch', () => ({ apiFetch }))

import { fetchVideoPlaybackUrl } from './video-playback'

const t = (message: string, values?: Record<string, string | number>) =>
  message.replace('{status}', String(values?.['status'] ?? ''))

describe('fetchVideoPlaybackUrl', () => {
  it('API から署名 URL を JSON で受け取る', async () => {
    apiFetch.mockResolvedValue(new Response(JSON.stringify({ url: 'https://s/v', expiresIn: 1 }), { status: 200 }))
    await expect(fetchVideoPlaybackUrl('f1', t)).resolves.toBe('https://s/v')
    expect(apiFetch).toHaveBeenCalledWith('/api/attachments/f1?as=json')
  })

  it('拒否されたらサーバーの理由をそのままエラーにする', async () => {
    apiFetch.mockResolvedValue(new Response(JSON.stringify({ error: '動画の取得に失敗しました' }), { status: 502 }))
    await expect(fetchVideoPlaybackUrl('f1', t)).rejects.toThrow('動画の取得に失敗しました')
  })

  it('URL が無い応答は再生できないエラーにする', async () => {
    apiFetch.mockResolvedValue(new Response('oops', { status: 500 }))
    await expect(fetchVideoPlaybackUrl('f1', t)).rejects.toThrow('Could not play the video (500)')
  })
})
