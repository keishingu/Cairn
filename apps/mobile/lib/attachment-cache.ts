import { translate } from '@cairn/shared'
import * as FileSystem from 'expo-file-system/legacy'
import * as Sharing from 'expo-sharing'
import { attachmentCacheFileName, isImageMime, shouldReuseCachedFile } from './attachment-file'

// legacy download API は安定した進捗不要ダウンロードに使える。
// SDK 55 からは package exports の types 条件で build 配下の型定義が解決される。

type Translate = (message: string, values?: Record<string, string | number>) => string

const translateJa: Translate = (message, values) => translate('ja', message, values)

// 同じファイルの取得中に別の画面（共有ボタン、ビューアの開き直しなど）から呼ばれても、
// ダウンロードを1本にまとめて同じ結果を待たせる
const pendingDownloads = new Map<string, Promise<string>>()

export function ensureCachedAttachment(
  fileUrl: string,
  fileId: string,
  fileName: string,
  accessToken: string,
  t: Translate = translateJa,
): Promise<string> {
  const cacheDirectory = FileSystem.cacheDirectory
  if (!cacheDirectory) return Promise.reject(new Error(t('This device cannot save files')))
  const target = `${cacheDirectory}${attachmentCacheFileName(fileId, fileName)}`
  const pending = pendingDownloads.get(target)
  if (pending) return pending

  const download = (async () => {
    const info = await FileSystem.getInfoAsync(target)
    if (shouldReuseCachedFile(info)) return info.uri

    // 保存先へ直接書き込むと、取得途中のファイルが「サイズのあるキャッシュ」として
    // 再利用されてしまう。一時ファイルに取り切ってから保存先へ移す
    const partial = `${target}.download`
    await FileSystem.deleteAsync(partial, { idempotent: true })
    const result = await FileSystem.downloadAsync(fileUrl, partial, {
      headers: { Authorization: `Bearer ${accessToken}` },
    })
    if (result.status !== 200) {
      await FileSystem.deleteAsync(partial, { idempotent: true }).catch(() => undefined)
      throw new Error(t('Download failed ({status})', { status: result.status }))
    }
    await FileSystem.deleteAsync(target, { idempotent: true })
    await FileSystem.moveAsync({ from: partial, to: target })
    return target
  })().finally(() => pendingDownloads.delete(target))

  pendingDownloads.set(target, download)
  return download
}

// 表示できなかったキャッシュを消し、再試行で取り直せるようにする
export async function removeCachedAttachment(fileId: string, fileName: string): Promise<void> {
  const cacheDirectory = FileSystem.cacheDirectory
  if (!cacheDirectory) return
  await FileSystem.deleteAsync(`${cacheDirectory}${attachmentCacheFileName(fileId, fileName)}`, {
    idempotent: true,
  })
}

export async function shareCachedAttachment(input: {
  fileUrl: string
  fileId: string
  fileName: string
  accessToken: string
  mimeType?: string | null
  dialogTitle: string
  t?: Translate
}): Promise<void> {
  const t = input.t ?? translateJa
  const uri = await ensureCachedAttachment(
    input.fileUrl,
    input.fileId,
    input.fileName,
    input.accessToken,
    t,
  )
  if (!(await Sharing.isAvailableAsync())) throw new Error(t('This device cannot share files'))
  const options: Sharing.SharingOptions = { dialogTitle: input.dialogTitle }
  if (input.mimeType) options.mimeType = input.mimeType
  if (isImageMime(input.mimeType)) options.UTI = 'public.image'
  await Sharing.shareAsync(uri, options)
}
