import React from 'react'
import { AppState } from 'react-native'
// createUploadTask（BACKGROUND セッション）は legacy API のみ提供。
// SDK 54 の新 API（File/Directory）にはバックグラウンド継続アップロードがない。
// 'expo-file-system/legacy' を直接 import すると TS ソースが解決され、
// exactOptionalPropertyTypes でライブラリ内部の型エラーになるため、
// 型は build の .d.ts（skipLibCheck 対象）から取り、実体は require で解決する
import type * as FileSystemTypes from 'expo-file-system/build/legacy/index'
import * as ImagePicker from 'expo-image-picker'
import * as DocumentPicker from 'expo-document-picker'
import * as Notifications from 'expo-notifications'
import { supabase } from '../lib/supabase'
import { API_BASE_URL } from '../lib/env'

// eslint-disable-next-line @typescript-eslint/no-require-imports
const FileSystem = require('expo-file-system/legacy') as typeof FileSystemTypes

// Web 側 /api/attachments/upload の ALLOWED_MIME_TYPES と揃える
const ALLOWED_MIME_TYPES = [
  'image/jpeg', 'image/png', 'image/gif', 'image/webp',
  'application/pdf',
  'application/msword',
  'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
  'application/vnd.ms-excel',
  'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
  'text/plain',
  'text/markdown',
]

export interface PendingUpload {
  id: string
  fileName: string
  // 0〜1
  progress: number
  status: 'uploading' | 'done' | 'error'
  fileId?: string
}

interface PickedFile {
  uri: string
  fileName: string
  mimeType: string
}

function uploadId(): string {
  return `up-${Date.now()}-${Math.random().toString(36).slice(2, 10)}`
}

// アプリがバックグラウンドにいる間に完了した場合、ローカル通知で知らせる
function notifyIfBackground(title: string, body: string) {
  if (AppState.currentState === 'active') return
  Notifications.scheduleNotificationAsync({ content: { title, body }, trigger: null }).catch(
    () => undefined,
  )
}

// チャット添付のアップロード。expo-file-system の createUploadTask（BACKGROUND セッション）
// を使い、アプリがバックグラウンドへ移動しても転送を継続する
export function useAttachmentUpload(channelId: string) {
  const [uploads, setUploads] = React.useState<PendingUpload[]>([])

  const patchUpload = React.useCallback((id: string, patch: Partial<PendingUpload>) => {
    setUploads(list => list.map(u => (u.id === id ? { ...u, ...patch } : u)))
  }, [])

  const uploadFile = React.useCallback(
    async (file: PickedFile) => {
      const id = uploadId()
      setUploads(list => [...list, { id, fileName: file.fileName, progress: 0, status: 'uploading' }])

      try {
        const { data: { session } } = await supabase.auth.getSession()
        if (!session) throw new Error('セッションがありません')

        const task = FileSystem.createUploadTask(
          `${API_BASE_URL}/api/attachments/upload`,
          file.uri,
          {
            uploadType: FileSystem.FileSystemUploadType.MULTIPART,
            fieldName: 'file',
            mimeType: file.mimeType,
            parameters: { channelId },
            headers: { Authorization: `Bearer ${session.access_token}` },
            sessionType: FileSystem.FileSystemSessionType.BACKGROUND,
          },
          (progress) => {
            const ratio =
              progress.totalBytesExpectedToSend > 0
                ? progress.totalBytesSent / progress.totalBytesExpectedToSend
                : 0
            patchUpload(id, { progress: ratio })
          },
        )

        const result = await task.uploadAsync()
        if (!result || result.status !== 201) {
          throw new Error(`アップロードに失敗しました (${result?.status ?? 'no response'})`)
        }
        const body = JSON.parse(result.body) as { fileId?: string }
        if (!body.fileId) throw new Error('アップロード応答に fileId がありません')

        patchUpload(id, { status: 'done', progress: 1, fileId: body.fileId })
        notifyIfBackground('アップロード完了', file.fileName)
      } catch (err) {
        console.error('[useAttachmentUpload] アップロード失敗:', err)
        patchUpload(id, { status: 'error' })
        notifyIfBackground('アップロード失敗', file.fileName)
      }
    },
    [channelId, patchUpload],
  )

  const pickImage = React.useCallback(async () => {
    const result = await ImagePicker.launchImageLibraryAsync({
      mediaTypes: ['images'],
      quality: 0.8,
    })
    const asset = result.assets?.[0]
    if (result.canceled || !asset) return
    await uploadFile({
      uri: asset.uri,
      fileName: asset.fileName ?? asset.uri.split('/').pop() ?? 'image.jpg',
      mimeType: asset.mimeType ?? 'image/jpeg',
    })
  }, [uploadFile])

  const pickDocument = React.useCallback(async () => {
    const result = await DocumentPicker.getDocumentAsync({
      type: ALLOWED_MIME_TYPES,
      copyToCacheDirectory: true,
    })
    const asset = result.assets?.[0]
    if (result.canceled || !asset) return
    await uploadFile({
      uri: asset.uri,
      fileName: asset.name,
      mimeType: asset.mimeType ?? 'application/octet-stream',
    })
  }, [uploadFile])

  const removeUpload = React.useCallback((id: string) => {
    setUploads(list => list.filter(u => u.id !== id))
  }, [])

  const clearUploads = React.useCallback(() => setUploads([]), [])

  // 送信に添付できるのはアップロード完了分のみ
  const doneFileIds = uploads.flatMap(u => (u.status === 'done' && u.fileId ? [u.fileId] : []))
  const isUploading = uploads.some(u => u.status === 'uploading')

  return { uploads, pickImage, pickDocument, removeUpload, clearUploads, doneFileIds, isUploading }
}
