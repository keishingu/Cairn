import { afterEach, describe, expect, it } from 'vitest'

type TestGlobal = typeof globalThis & {
  __cairnMockMessageStore?: Map<string, unknown[]>
}

const CHANNEL_ID = '50000000-0000-0000-0000-000000000001'

describe('messages route mock mode', () => {
  afterEach(() => {
    delete process.env['DATABASE_URL']
    delete (globalThis as TestGlobal).__cairnMockMessageStore
  })

  it('POST 後の GET で同じメッセージ一覧を返す', async () => {
    delete process.env['DATABASE_URL']

    const { GET, POST } = await import('./route')

    const postResponse = await POST(
      new Request('http://localhost/api/channels/test/messages', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ content: 'モック送信テスト' }),
      }),
      { params: Promise.resolve({ channelId: CHANNEL_ID }) },
    )

    expect(postResponse.status).toBe(201)

    const created = await postResponse.json()
    expect(created.content).toBe('モック送信テスト')

    const getResponse = await GET(
      new Request('http://localhost/api/channels/test/messages'),
      { params: Promise.resolve({ channelId: CHANNEL_ID }) },
    )

    expect(getResponse.status).toBe(200)
    await expect(getResponse.json()).resolves.toEqual([created])
  })
})
