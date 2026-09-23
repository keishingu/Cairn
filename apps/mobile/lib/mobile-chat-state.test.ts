import { describe, expect, it } from 'vitest'
import {
  filterProjectMentionMembers,
  findMentionQuery,
  hasFailedUploads,
  insertMention,
  matchMarkdownMention,
  mergeChatMessages,
  nextMessagePageCursor,
  parseEditableMentions,
  rebaseMentionSelections,
  resolveInternalAppPath,
  resolveMobileMarkdownLink,
  serializeMentions,
  shouldRetryRealtime,
} from './mobile-chat-state'

describe('モバイルチャット状態', () => {
  it('JOIN が TIMED_OUT したら Realtime 購読を再接続する', () => {
    expect(shouldRetryRealtime('TIMED_OUT')).toBe(true)
  })

  it.each(['CHANNEL_ERROR', 'SUBSCRIBED'])(
    '%sではアプリ側でRealtime購読を作り直さない',
    (status) => {
      expect(shouldRetryRealtime(status)).toBe(false)
    },
  )

  it('CLOSED ではアプリ側でRealtime購読を作り直す', () => {
    expect(shouldRetryRealtime('CLOSED')).toBe(true)
  })

  it('topic 権限拒否ではアプリ側でRealtime購読を作り直さない', () => {
    expect(shouldRetryRealtime('CHANNEL_ERROR', {
      message: 'Unauthorized: You do not have permissions to read from this Channel topic: channel:1',
    })).toBe(false)
    expect(shouldRetryRealtime('TIMED_OUT', {
      message: 'Unauthorized: You do not have permissions to read from this Channel topic: channel:1',
    })).toBe(false)
  })

  it('Unauthorized でも JWT 期限切れは topic 権限拒否と区別する', () => {
    expect(shouldRetryRealtime('CHANNEL_ERROR', {
      message: 'Unauthorized: Token has expired',
    })).toBe(false)
    expect(shouldRetryRealtime('TIMED_OUT', {
      message: 'Unauthorized: Token has expired',
    })).toBe(true)
  })

  it('失敗した添付が一件でも残っていれば送信を止める', () => {
    expect(hasFailedUploads([{ status: 'done' }, { status: 'error' }])).toBe(true)
    expect(hasFailedUploads([{ status: 'done' }, { status: 'uploading' }])).toBe(false)
  })

  it('カーソル直前のメンション候補を置換して canonical 形式へ変換する', () => {
    const range = findMentionQuery('確認を @山', 6)
    expect(range).toEqual({ start: 4, end: 6, query: '山' })

    const inserted = insertMention('確認を @山', range!, '山田 太郎')
    expect(inserted).toEqual({ text: '確認を @山田 太郎 ', cursor: 11 })
    expect(
      serializeMentions(inserted.text, [
        { start: 4, end: inserted.cursor - 1, userId: 'user-1', displayName: '山田 太郎' },
      ]),
    ).toBe('確認を <@user-1> ')
  })

  it('同名ユーザーのメンションを出現ごとのIDで保持し、編集にも追従する', () => {
    const editable = parseEditableMentions('確認 <@user-1|山田 太郎> と <@user-2|山田 太郎>')
    expect(editable.text).toBe('確認 @山田 太郎 と @山田 太郎')
    expect(serializeMentions(editable.text, editable.mentions)).toBe(
      '確認 <@user-1> と <@user-2>',
    )

    const changed = `至急 ${editable.text}`
    const rebased = rebaseMentionSelections(editable.text, changed, editable.mentions)
    expect(serializeMentions(changed, rebased)).toBe('至急 確認 <@user-1> と <@user-2>')

    const editedName = changed.replace('@山田 太郎', '@山田')
    expect(
      serializeMentions(editedName, rebaseMentionSelections(changed, editedName, rebased)),
    ).toBe('至急 確認 @山田 と <@user-2>')
  })

  it('Markdown構文を含む表示名も一つのメンショントークンとして読む', () => {
    const token = '<@user-1|A *B* [help](https://example.com)>'
    expect(matchMarkdownMention(`${token} さん`, 0)).toEqual({
      length: token.length,
      userId: 'user-1',
      displayName: 'A *B* [help](https://example.com)',
    })
  })

  it('過去ページと最新ページを重複なく時系列へ結合する', () => {
    const old = [
      { id: '1', createdAt: '2026-01-01T00:00:00Z' },
      { id: '2', createdAt: '2026-01-02T00:00:00Z' },
    ]
    const latest = [
      { id: '2', createdAt: '2026-01-02T00:00:00Z' },
      { id: '3', createdAt: '2026-01-03T00:00:00Z' },
    ]
    expect(mergeChatMessages(old, latest).map((message) => message.id)).toEqual(['1', '2', '3'])
    expect(nextMessagePageCursor({ messages: old, hasMore: true })).toBe('1')
    expect(nextMessagePageCursor({ messages: old, hasMore: false })).toBeUndefined()
  })

  it('プロジェクトでは非guest全員と参加guestだけをメンション候補にする', () => {
    const members = [
      { userId: 'member-1', role: 'member' as const },
      { userId: 'guest-1', role: 'guest' as const },
      { userId: 'guest-2', role: 'guest' as const },
    ]
    expect(filterProjectMentionMembers(members, [{ userId: 'guest-1' }])).toEqual([
      members[0],
      members[1],
    ])
  })

  it('MarkdownリンクはCairn内導線と安全な外部URLだけを許可する', () => {
    const baseUrl = 'https://develop.oss-cairn.com'
    expect(resolveMobileMarkdownLink('/projects?open=project-1', baseUrl)).toEqual({
      kind: 'internal',
      path: '/projects?open=project-1',
    })
    expect(
      resolveMobileMarkdownLink('https://develop.oss-cairn.com/chats/channel-1?m=message-1', baseUrl),
    ).toEqual({
      kind: 'internal',
      path: '/chats/channel-1?m=message-1&nativeAux=1',
    })
    expect(resolveMobileMarkdownLink('https://example.com/guide', baseUrl)).toEqual({
      kind: 'external',
      url: 'https://example.com/guide',
    })
    expect(resolveMobileMarkdownLink('javascript:alert(1)', baseUrl)).toBeNull()
    expect(resolveMobileMarkdownLink('//example.com/guide', baseUrl)).toBeNull()
    expect(resolveMobileMarkdownLink('/chats/../auth/mobile-signout', baseUrl)).toBeNull()
    expect(resolveInternalAppPath('/projects/../chats/channel-1', baseUrl)).toBe(
      '/chats/channel-1',
    )
  })
})
