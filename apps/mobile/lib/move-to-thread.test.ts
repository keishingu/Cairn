import { describe, expect, it } from 'vitest'
import { buildMoveBody, canMoveMessageToThread } from './move-to-thread'

const parentChannel = { parentChannelId: null }

describe('スレッドに切り出すメニューの表示条件', () => {
  it('親ワークスペースチャンネルの通常メッセージを member 以上が開いたときに出す', () => {
    for (const role of ['owner', 'admin', 'member'] as const) {
      expect(canMoveMessageToThread({ channelType: 'workspace', workspaceChannel: parentChannel, role, messageType: 'text' })).toBe(true)
    }
  })

  it('ゲストやロール未解決のときは出さない', () => {
    expect(canMoveMessageToThread({ channelType: 'workspace', workspaceChannel: parentChannel, role: 'guest', messageType: 'text' })).toBe(false)
    expect(canMoveMessageToThread({ channelType: 'workspace', workspaceChannel: parentChannel, role: undefined, messageType: 'text' })).toBe(false)
  })

  it('システムメッセージには出さない', () => {
    expect(canMoveMessageToThread({ channelType: 'workspace', workspaceChannel: parentChannel, role: 'admin', messageType: 'system' })).toBe(false)
  })

  it('スレッド・プロジェクト・DM では出さない', () => {
    expect(canMoveMessageToThread({ channelType: 'workspace', workspaceChannel: { parentChannelId: 'parent' }, role: 'admin', messageType: 'text' })).toBe(false)
    expect(canMoveMessageToThread({ channelType: 'project', workspaceChannel: undefined, role: 'admin', messageType: 'text' })).toBe(false)
    expect(canMoveMessageToThread({ channelType: 'dm', workspaceChannel: undefined, role: 'admin', messageType: 'text' })).toBe(false)
  })

  it('チャンネル一覧で親か判別できないうちは出さない', () => {
    expect(canMoveMessageToThread({ channelType: 'workspace', workspaceChannel: undefined, role: 'admin', messageType: 'text' })).toBe(false)
  })
})

describe('切り出しリクエストの組み立て', () => {
  it('このメッセージだけは起点1件の messageIds で送る', () => {
    expect(buildMoveBody('single', 'm1', { kind: 'new', name: ' 相談 ' })).toEqual({ messageIds: ['m1'], threadName: '相談' })
  })

  it('以降すべては fromMessageId で送り、既存スレッドは threadId を渡す', () => {
    expect(buildMoveBody('after', 'm1', { kind: 'existing', threadId: 't1' })).toEqual({ fromMessageId: 'm1', threadId: 't1' })
  })
})
