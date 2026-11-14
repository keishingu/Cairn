import { describe, expect, test } from 'vitest'
import { canMentionUser, profileSheetActions, profileSheetTargetFromMessage } from './user-profile-actions'

const base = {
  meId: 'me',
  targetId: 'u1',
  blockedByMe: false,
  blockedEitherWay: false,
  isActiveMember: true,
  dmEnabled: true,
  canMention: true,
}

describe('profileSheetTargetFromMessage', () => {
  const message = { messageType: 'text' as const, senderId: 'u1', senderName: '山田', senderAvatarUrl: null }

  test('通常メッセージの送信者を対象にする', () => {
    expect(profileSheetTargetFromMessage(message)).toEqual({
      userId: 'u1',
      displayName: '山田',
      avatarUrl: null,
      blockedEitherWay: false,
    })
  })

  test('どちらかの向きのブロックを blockedEitherWay に引き継ぐ', () => {
    expect(profileSheetTargetFromMessage({ ...message, blocked: true })?.blockedEitherWay).toBe(true)
  })

  test('システムメッセージは対象にしない', () => {
    expect(profileSheetTargetFromMessage({ ...message, messageType: 'system' })).toBeNull()
  })

  test('アプリ（Bot）の発言は対象にしない', () => {
    expect(
      profileSheetTargetFromMessage({ ...message, senderApp: { name: '投票', iconUrl: null, uninstalled: false } }),
    ).toBeNull()
  })

  test('送信者 ID がないメッセージは対象にしない', () => {
    expect(profileSheetTargetFromMessage({ ...message, senderId: '' })).toBeNull()
  })
})

describe('profileSheetActions', () => {
  test('他のメンバーには DM・メンション・ブロックを出す', () => {
    expect(profileSheetActions(base)).toEqual(['dm', 'mention', 'block'])
  })

  test('自分自身には操作を出さない', () => {
    expect(profileSheetActions({ ...base, targetId: 'me' })).toEqual([])
  })

  test('自分の ID が未取得なら操作を出さない', () => {
    expect(profileSheetActions({ ...base, meId: undefined })).toEqual([])
  })

  test('DM 機能が無効なら DM を隠す', () => {
    expect(profileSheetActions({ ...base, dmEnabled: false })).toEqual(['mention', 'block'])
  })

  test('メンションできないチャンネルではメンションを隠す', () => {
    expect(profileSheetActions({ ...base, canMention: false })).toEqual(['dm', 'block'])
  })

  test('ブロック済みなら DM とブロックの代わりに解除を出す', () => {
    expect(profileSheetActions({ ...base, blockedByMe: true, blockedEitherWay: true })).toEqual(['mention', 'unblock'])
  })

  test('相手からブロックされているときは DM を出さずブロックは出す', () => {
    expect(profileSheetActions({ ...base, blockedEitherWay: true })).toEqual(['mention', 'block'])
  })

  test('ブロック状態が未取得なら DM・ブロック・解除を出さない', () => {
    expect(profileSheetActions({ ...base, blockedByMe: null })).toEqual(['mention'])
  })

  test('有効なメンバーではない相手には何も出さない', () => {
    expect(profileSheetActions({ ...base, isActiveMember: false })).toEqual([])
  })

  test('メンバー一覧が未取得でもサーバーに委ねて DM とブロックを出す', () => {
    expect(profileSheetActions({ ...base, isActiveMember: null, canMention: false })).toEqual(['dm', 'block'])
  })

  test('メンバーでなくてもブロック済みなら解除はできる', () => {
    expect(profileSheetActions({ ...base, isActiveMember: false, blockedByMe: true })).toEqual(['unblock'])
  })
})

describe('canMentionUser', () => {
  const input = {
    composerAvailable: true,
    channelType: 'workspace' as const,
    targetId: 'u1',
    mentionableUserIds: new Set(['u1', 'u2']),
  }

  test('候補に含まれる相手はメンションできる', () => {
    expect(canMentionUser(input)).toBe(true)
  })

  test('入力欄が使えないときはメンションできない', () => {
    expect(canMentionUser({ ...input, composerAvailable: false })).toBe(false)
  })

  test('DM ではメンションできない', () => {
    expect(canMentionUser({ ...input, channelType: 'dm' })).toBe(false)
  })

  test('候補に含まれない相手はメンションできない', () => {
    expect(canMentionUser({ ...input, targetId: 'u9' })).toBe(false)
  })

  test('候補が未取得ならメンションできない', () => {
    expect(canMentionUser({ ...input, mentionableUserIds: null })).toBe(false)
  })
})
