import { translate } from '@cairn/shared'
import { describe, expect, it } from 'vitest'
import { resolveChannelOpenParams } from './channel-open-params'

const t = (message: string, values?: Record<string, string | number>) =>
  translate('ja', message, values)

const project = {
  channelId: 'project-channel',
  channelName: '定例',
  projectTitle: '山行',
  projectId: 'project-1',
  milestoneId: null,
}

describe('通知から開くチャットの表示情報', () => {
  it('プロジェクトチャンネルはプロジェクト名と projectId を渡す', () => {
    expect(resolveChannelOpenParams('project-channel', { projects: [project] }, t)).toEqual({
      channelId: 'project-channel',
      channelName: '山行',
      channelType: 'project',
      projectId: 'project-1',
    })
  })

  it('マイルストーンはチャンネル名を使う', () => {
    expect(
      resolveChannelOpenParams(
        'project-channel',
        {
          projects: [{ ...project, milestoneId: 'milestone-1', channelName: '集合' }],
        },
        t,
      ),
    ).toMatchObject({ channelName: '集合', channelType: 'project' })
  })

  it('ワークスペースチャンネルは公開設定を渡す', () => {
    expect(
      resolveChannelOpenParams(
        'ws-1',
        {
          workspace: [{ id: 'ws-1', name: '雑談', isPrivate: true }],
        },
        t,
      ),
    ).toEqual({
      channelId: 'ws-1',
      channelName: '雑談',
      channelType: 'workspace',
      isPrivate: '1',
    })
  })

  it('DM は相手の名前を渡す', () => {
    expect(
      resolveChannelOpenParams(
        'dm-1',
        {
          dms: [{ id: 'dm-1', participantName: '山田' }],
        },
        t,
      ),
    ).toEqual({
      channelId: 'dm-1',
      channelName: '山田',
      channelType: 'dm',
    })
  })

  it('一覧に無いチャンネルは id だけを渡す', () => {
    expect(resolveChannelOpenParams('missing', {}, t)).toEqual({ channelId: 'missing' })
  })

  it('名前のないワークスペースチャンネルは渡した表示言語の名前を使う', () => {
    const unnamed = { workspace: [{ id: 'ws-1', name: null, isPrivate: false }] }
    expect(resolveChannelOpenParams('ws-1', unnamed, t)).toMatchObject({ channelName: 'チャンネル' })
    expect(
      resolveChannelOpenParams('ws-1', unnamed, (message, values) => translate('en', message, values)),
    ).toMatchObject({ channelName: 'Channels' })
  })
})
