import { describe, expect, test } from 'vitest'
import { attachmentRequestHeaders } from './attachment-auth'

describe('attachmentRequestHeaders', () => {
  test('選択中のワークスペースを apiFetch と同じヘッダーで伝える', () => {
    expect(attachmentRequestHeaders({ accessToken: 'token', workspaceId: 'workspace-2' })).toEqual({
      Authorization: 'Bearer token',
      'X-Cairn-Workspace-Id': 'workspace-2',
    })
  })

  test('ワークスペースが未選択のときは認証ヘッダーだけを付ける', () => {
    expect(attachmentRequestHeaders({ accessToken: 'token', workspaceId: null })).toEqual({
      Authorization: 'Bearer token',
    })
  })
})
