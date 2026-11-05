import { describe, expect, it } from 'vitest'
import { parseWebViewDownloadRequest } from './webview-download'

const FILE_ID = '11111111-1111-4111-8111-111111111111'
const PROJECT_ID = '22222222-2222-4222-8222-222222222222'
const WS_ID = '33333333-3333-4333-8333-333333333333'

describe('parseWebViewDownloadRequest', () => {
  it('PDF 原本とギャラリー原本の取得口だけを受け付ける', () => {
    expect(
      parseWebViewDownloadRequest({ type: 'download-file', path: `/api/attachments/${FILE_ID}?original=1`, fileName: 'a.pdf', workspaceId: WS_ID }),
    ).toMatchObject({ path: `/api/attachments/${FILE_ID}?original=1`, fileName: 'a.pdf', workspaceId: WS_ID })
    expect(
      parseWebViewDownloadRequest({
        type: 'download-file',
        path: `/api/projects/${PROJECT_ID}/gallery/${FILE_ID}/file?original=1`,
        fileName: 'IMG.JPG',
        workspaceId: null,
      }),
    ).toMatchObject({ workspaceId: null })
  })

  it.each([
    ['外部URL', 'https://evil.example/api/attachments/x?original=1'],
    ['原本以外のAPI', '/api/me/account'],
    ['パストラバーサル', `/api/attachments/../me?original=1`],
    ['クエリの付け足し', `/api/attachments/${FILE_ID}?original=1&x=1`],
  ])('%s には認証つきで取りに行かない', (_label, path) => {
    expect(parseWebViewDownloadRequest({ type: 'download-file', path, fileName: 'a.pdf', workspaceId: null })).toBeNull()
  })

  it('ワークスペース ID の形が不正なら受け付けない', () => {
    expect(
      parseWebViewDownloadRequest({ type: 'download-file', path: `/api/attachments/${FILE_ID}?original=1`, fileName: 'a.pdf', workspaceId: 'x' }),
    ).toBeNull()
  })
})
