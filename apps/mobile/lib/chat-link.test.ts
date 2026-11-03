import { describe, expect, test } from 'vitest'
import { chatLinkTarget, isAppOrigin } from './chat-link'

const appBaseUrl = 'https://develop.oss-cairn.com'
const CHANNEL_ID = '0b9c2f4e-3d7a-4c1b-9e8f-1a2b3c4d5e6f'
const MESSAGE_ID = '7f6e5d4c-3b2a-4190-8f7e-6d5c4b3a2918'
const devBaseUrl = 'http://192.168.0.10:3128'

describe('chatLinkTarget', () => {
  test('チャンネルを指すリンクはチャンネルを返す', () => {
    expect(chatLinkTarget(`${appBaseUrl}/chats/${CHANNEL_ID}`, appBaseUrl, false)).toEqual({
      kind: 'channel',
      channelId: CHANNEL_ID,
    })
  })

  test('メッセージを指すリンクはメッセージ ID も返す', () => {
    expect(chatLinkTarget(`${appBaseUrl}/chats/${CHANNEL_ID}?m=${MESSAGE_ID}`, appBaseUrl, false)).toEqual({
      kind: 'channel',
      channelId: CHANNEL_ID,
      messageId: MESSAGE_ID,
    })
  })

  test('相対パスも接続先の Web のリンクとして扱う', () => {
    expect(chatLinkTarget(`/chats/${CHANNEL_ID}?m=${MESSAGE_ID}`, appBaseUrl, false)).toEqual({
      kind: 'channel',
      channelId: CHANNEL_ID,
      messageId: MESSAGE_ID,
    })
  })

  test('チャット一覧や存在しない下位パスは一覧を返す', () => {
    expect(chatLinkTarget(`${appBaseUrl}/chats`, appBaseUrl, false)).toEqual({ kind: 'list' })
    expect(chatLinkTarget(`${appBaseUrl}/chats?dm=1`, appBaseUrl, false)).toEqual({ kind: 'list' })
    expect(chatLinkTarget(`${appBaseUrl}/chats/${CHANNEL_ID}/extra`, appBaseUrl, false)).toEqual({ kind: 'list' })
  })

  test('ID が UUID でないリンクは開けない扱いにし、デコードしたパスを API へ渡さない', () => {
    expect(chatLinkTarget(`${appBaseUrl}/chats/..%2Fauth%2Fmobile-signout`, appBaseUrl, false)).toEqual({ kind: 'invalid' })
    expect(chatLinkTarget(`${appBaseUrl}/chats/channel-1`, appBaseUrl, false)).toEqual({ kind: 'invalid' })
    expect(chatLinkTarget(`${appBaseUrl}/chats/${CHANNEL_ID}?m=..%2F..%2Fme`, appBaseUrl, false)).toEqual({ kind: 'invalid' })
  })

  test('チャット以外の画面のリンクは対象にしない', () => {
    expect(chatLinkTarget(`${appBaseUrl}/tasks`, appBaseUrl, false)).toBeNull()
    expect(chatLinkTarget(`${appBaseUrl}/chatsearch`, appBaseUrl, false)).toBeNull()
  })

  test('別環境・別サイトのリンクは対象にしない', () => {
    expect(chatLinkTarget(`https://another-env.example.com/chats/${CHANNEL_ID}`, appBaseUrl, false)).toBeNull()
    expect(chatLinkTarget(`//evil.example.com/chats/${CHANNEL_ID}`, appBaseUrl, false)).toBeNull()
    expect(chatLinkTarget('mailto:someone@example.com', appBaseUrl, false)).toBeNull()
    expect(chatLinkTarget('', appBaseUrl, false)).toBeNull()
  })

  test('開発ビルドでは同じポートの localhost のリンクも接続先の Web とみなす', () => {
    expect(chatLinkTarget(`http://localhost:3128/chats/${CHANNEL_ID}`, devBaseUrl, true)).toEqual({
      kind: 'channel',
      channelId: CHANNEL_ID,
    })
    expect(chatLinkTarget(`http://127.0.0.1:3128/chats/${CHANNEL_ID}`, devBaseUrl, true)).toEqual({
      kind: 'channel',
      channelId: CHANNEL_ID,
    })
  })

  test('開発ビルドでもポートが違う localhost や、本番ビルドの localhost は対象にしない', () => {
    expect(chatLinkTarget(`http://localhost:3000/chats/${CHANNEL_ID}`, devBaseUrl, true)).toBeNull()
    expect(chatLinkTarget(`http://localhost:3128/chats/${CHANNEL_ID}`, devBaseUrl, false)).toBeNull()
  })
})

describe('isAppOrigin', () => {
  test('接続先と同じオリジンなら true を返す', () => {
    expect(isAppOrigin(new URL(`${appBaseUrl}/projects`), appBaseUrl, false)).toBe(true)
  })

  test('接続先の URL が不正なら false を返す', () => {
    expect(isAppOrigin(new URL(`${appBaseUrl}/projects`), 'not a url', true)).toBe(false)
  })
})
