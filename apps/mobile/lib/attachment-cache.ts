import { translate } from '@cairn/shared'
import type * as FileSystemTypes from 'expo-file-system/build/legacy/index'
import * as Sharing from 'expo-sharing'
import { attachmentCacheFileName, isImageMime, shouldReuseCachedFile } from './attachment-file'

// SDK 54 の legacy download API は安定した進捗不要ダウンロードに使える。
// 型定義だけ build 配下から参照し、アプリコード側の exactOptionalPropertyTypes の影響を避ける。
// eslint-disable-next-line @typescript-eslint/no-require-imports
const FileSystem = require('expo-file-system/legacy') as typeof FileSystemTypes

type Translate = (message: string, values?: Record<string, string | number>) => string

const translateJa: Translate = (message, values) => translate('ja', message, values)

export async function ensureCachedAttachment(
  fileUrl: string,
  fileId: string,
  fileName: string,
  accessToken: string,
  t: Translate = translateJa,
): Promise<string> {
  const cacheDirectory = FileSystem.cacheDirectory
  if (!cacheDirectory) throw new Error(t('This device cannot save files'))
  const target = `${cacheDirectory}${attachmentCacheFileName(fileId, fileName)}`
  const info = await FileSystem.getInfoAsync(target)
  if (shouldReuseCachedFile(info)) return info.uri

  const result = await FileSystem.downloadAsync(fileUrl, target, {
    headers: { Authorization: `Bearer ${accessToken}` },
  })
  if (result.status !== 200) {
    await FileSystem.deleteAsync(target, { idempotent: true }).catch(() => undefined)
    throw new Error(t('Download failed ({status})', { status: result.status }))
  }
  return result.uri
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
