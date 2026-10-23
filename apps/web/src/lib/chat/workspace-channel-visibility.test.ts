import { describe, expect, it } from 'vitest'
import { visibleWorkspaceChannels } from './workspace-channel-visibility'

const publicChannel = { id: 'public', isPrivate: false }
const joinedPrivate = { id: 'joined-private', isPrivate: true }
const otherPrivate = { id: 'other-private', isPrivate: true }

describe('visibleWorkspaceChannels', () => {
  const joinedIds = new Set(['joined-private', 'public'])

  it('member 以上は公開チャンネルと自分が参加している非公開チャンネルだけ返す', () => {
    expect(visibleWorkspaceChannels(
      [publicChannel, joinedPrivate, otherPrivate],
      joinedIds,
      'owner',
    )).toEqual([publicChannel, joinedPrivate])
  })

  it('ゲストは参加しているチャンネルだけ返す', () => {
    expect(visibleWorkspaceChannels(
      [publicChannel, joinedPrivate, otherPrivate],
      new Set(['joined-private']),
      'guest',
    )).toEqual([joinedPrivate])
  })
})
