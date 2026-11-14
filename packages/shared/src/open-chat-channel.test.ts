import { describe, expect, it } from 'vitest'
import { nextChatChannelAfterRemoval, openChannelDisappeared } from './open-chat-channel'

describe('開いているチャットが消えたときの移動先', () => {
  it('一覧に見えていた会話が消えたときだけ移動する', () => {
    expect(openChannelDisappeared('channel-1', ['channel-1', 'channel-2'], ['channel-2'])).toBe(true)
  })

  it('まだ一覧にいる会話や、作成直後で再取得前の会話は動かさない', () => {
    expect(openChannelDisappeared('channel-1', ['channel-1'], ['channel-1'])).toBe(false)
    expect(openChannelDisappeared('new-thread', ['channel-1'], ['channel-1'])).toBe(false)
    expect(openChannelDisappeared(null, ['channel-1'], [])).toBe(false)
  })

  it('最初の確定一覧に無い会話は、削除済みの URL として離れる', () => {
    expect(openChannelDisappeared('deleted', null, ['channel-1'])).toBe(true)
  })

  it('残っている会話は未アーカイブのプロジェクト、ワークスペースチャンネル、DM の順で選ぶ', () => {
    expect(nextChatChannelAfterRemoval({
      projectChannels: [
        { id: 'archived', archived: true },
        { id: 'project', archived: false },
      ],
      workspaceChannelIds: ['general'],
      dmIds: ['dm'],
    })).toBe('project')

    expect(nextChatChannelAfterRemoval({
      projectChannels: [{ id: 'archived', archived: true }],
      workspaceChannelIds: ['general'],
      dmIds: ['dm'],
    })).toBe('general')

    expect(nextChatChannelAfterRemoval({
      projectChannels: [],
      workspaceChannelIds: [],
      dmIds: ['dm'],
    })).toBe('dm')

    expect(nextChatChannelAfterRemoval({
      projectChannels: [],
      workspaceChannelIds: [],
      dmIds: [],
    })).toBeNull()
  })
})
