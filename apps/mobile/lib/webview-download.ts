// Web（WebView）から届く「API 経由のファイルを保存したい」要求の検証。
// WebView では window.open で保存できないため、Web は path を渡し、アプリが認証つきで取得して共有シートを出す。
// Web のページ内容に関係なく、Cairn の API の原本取得口以外へ認証ヘッダーを送らない

export const DOWNLOAD_FILE_MESSAGE_TYPE = 'download-file'

export interface WebViewDownloadRequest {
  path: string
  fileName: string
  workspaceId: string | null
  /** 端末キャッシュのファイル名に使う、path から作った識別子 */
  cacheKey: string
}

const ALLOWED_PATHS = [
  /^\/api\/attachments\/[0-9a-f-]{36}\?original=1$/i,
  /^\/api\/projects\/[0-9a-f-]{36}\/gallery\/[0-9a-f-]{36}\/file\?original=1$/i,
]
const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i

export function parseWebViewDownloadRequest(msg: unknown): WebViewDownloadRequest | null {
  if (!msg || typeof msg !== 'object') return null
  const { type, path, fileName, workspaceId } = msg as Record<string, unknown>
  if (type !== DOWNLOAD_FILE_MESSAGE_TYPE) return null
  if (typeof path !== 'string' || !ALLOWED_PATHS.some((pattern) => pattern.test(path))) return null
  if (typeof fileName !== 'string' || fileName.trim().length === 0 || fileName.length > 255) return null
  if (workspaceId !== null && workspaceId !== undefined && (typeof workspaceId !== 'string' || !UUID.test(workspaceId))) {
    return null
  }
  return {
    path,
    fileName,
    workspaceId: typeof workspaceId === 'string' ? workspaceId : null,
    cacheKey: `original_${path.replace(/[^0-9a-z]/gi, '_')}`,
  }
}
