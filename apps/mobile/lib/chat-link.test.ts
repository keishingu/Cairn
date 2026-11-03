import { describe, expect, test } from 'vitest'
import { chatLinkTarget, isAppOrigin } from './chat-link'

const appBaseUrl = 'https://develop.oss-cairn.com'
const devBaseUrl = 'http://192.168.0.10:3128'

describe('chatLinkTarget', () => {
  test('チャンネルを指すリンクはチャンネルを返す', () => {
    expect(chatLinkTarget(`${appBaseUrl}/chats/channel-1`, appBaseUrl, false)).toEqual({
      kind: 'channel',
      channelId: 'channel-1',
    })
  })

  test('メッセージを指すリンクはメッセージ ID も返す', () => {
    expect(chatLinkTarget(`${appBaseUrl}/chats/channel-1?m=message-1`, appBaseUrl, false)).toEqual({
      kind: 'channel',
      channelId: 'channel-1',
      messageId: 'message-1',
    })
  })

  test('相対パスも接続先の Web のリンクとして扱う', () => {
    expect(chatLinkTarget('/chats/channel-1?m=message-1', appBaseUrl, false)).toEqual({
      kind: 'channel',
      channelId: 'channel-1',
      messageId: 'message-1',
    })
  })

  test('チャット一覧や存在しない下位パスは一覧を返す', () => {
    expect(chatLinkTarget(`${appBaseUrl}/chats`, appBaseUrl, false)).toEqual({ kind: 'list' })
    expect(chatLinkTarget(`${appBaseUrl}/chats?dm=1`, appBaseUrl, false)).toEqual({ kind: 'list' })
    expect(chatLinkTarget(`${appBaseUrl}/chats/channel-1/extra`, appBaseUrl, false)).toEqual({ kind: 'list' })
  })

  test('チャット以外の画面のリンクは対象にしない', () => {
    expect(chatLinkTarget(`${appBaseUrl}/tasks`, appBaseUrl, false)).toBeNull()
    expect(chatLinkTarget(`${appBaseUrl}/chatsearch`, appBaseUrl, false)).toBeNull()
  })

  test('別環境・別サイトのリンクは対象にしない', () => {
    expect(chatLinkTarget('https://another-env.example.com/chats/channel-1', appBaseUrl, false)).toBeNull()
    expect(chatLinkTarget('//evil.example.com/chats/channel-1', appBaseUrl, false)).toBeNull()
    expect(chatLinkTarget('mailto:someone@example.com', appBaseUrl, false)).toBeNull()
    expect(chatLinkTarget('', appBaseUrl, false)).toBeNull()
  })

  test('開発ビルドでは同じポートの localhost のリンクも接続先の Web とみなす', () => {
    expect(chatLinkTarget('http://localhost:3128/chats/channel-1', devBaseUrl, true)).toEqual({
      kind: 'channel',
      channelId: 'channel-1',
    })
    expect(chatLinkTarget('http://127.0.0.1:3128/chats/channel-1', devBaseUrl, true)).toEqual({
      kind: 'channel',
      channelId: 'channel-1',
    })
  })

  test('開発ビルドでもポートが違う localhost や、本番ビルドの localhost は対象にしない', () => {
    expect(chatLinkTarget('http://localhost:3000/chats/channel-1', devBaseUrl, true)).toBeNull()
    expect(chatLinkTarget('http://localhost:3128/chats/channel-1', devBaseUrl, false)).toBeNull()
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
