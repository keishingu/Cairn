import React from 'react'
import { Alert } from 'react-native'
import * as DocumentPicker from 'expo-document-picker'
import * as ImagePicker from 'expo-image-picker'
import { File } from 'expo-file-system'
import { apiFetch } from '../lib/api-fetch'
import { AttachmentFinalizeError, finalizeAttachment } from '../lib/attachment-finalize'
import { MAX_MESSAGE_ATTACHMENTS } from '@cairn/shared'
import { remainingAttachmentSlots } from '../lib/attachment-limit'
import { hasFailedUploads } from '../lib/mobile-chat-state'
import { supabase } from '../lib/supabase'
import { useT } from '../components/locale-provider'

const ALLOWED_DOCUMENT_TYPES = [
  'application/pdf',
  'application/msword',
  'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
  'application/vnd.ms-excel',
  'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
  'application/vnd.ms-powerpoint',
  'application/vnd.openxmlformats-officedocument.presentationml.presentation',
  'text/csv',
  'text/plain',
  'text/markdown',
]

export interface PendingUpload {
  id: string
  channelId: string
  fileName: string
  status: 'uploading' | 'done' | 'error'
  fileId?: string
  error?: string | undefined
  retryFinalize?: (() => Promise<{ fileId: string }>) | undefined
}

type PickedFile = {
  uri: string
  fileName: string
  mimeType: string
  fileSize: number
}

type SignedUploadDto = {
  token: string
  storagePath: string
  mimeType: string
}

function uploadId(): string {
  return `upload-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`
}

async function responseError(res: Response, fallback: string): Promise<Error> {
  const data = (await res.json().catch(() => ({}))) as { error?: string }
  return new Error(data.error ?? fallback)
}

export function useAttachmentUpload(channelId: string) {
  const t = useT()
  const [uploads, setUploads] = React.useState<PendingUpload[]>([])

  React.useEffect(() => {
    setUploads([])
  }, [channelId])

  const patchUpload = React.useCallback((id: string, patch: Partial<PendingUpload>) => {
    setUploads((current) =>
      current.map((upload) => (upload.id === id ? { ...upload, ...patch } : upload)),
    )
  }, [])

  const uploadOne = React.useCallback(
    async (picked: PickedFile, id: string) => {
      try {
        const signResponse = await apiFetch('/api/attachments/upload-url', {
          method: 'POST',
          body: JSON.stringify({
            channelId,
            fileName: picked.fileName,
            mimeType: picked.mimeType,
            fileSize: picked.fileSize,
          }),
        })
        if (!signResponse.ok)
          throw await responseError(signResponse, t('Could not prepare the upload'))
        const signed = (await signResponse.json()) as SignedUploadDto

        const file = new File(picked.uri)
        const bytes = await file.arrayBuffer()
        const { error: storageError } = await supabase.storage
          .from('chat-attachments')
          .uploadToSignedUrl(signed.storagePath, signed.token, bytes, {
            contentType: signed.mimeType,
          })
        if (storageError) throw storageError

        const finalized = await finalizeAttachment({
          channelId,
          storagePath: signed.storagePath,
          fileName: picked.fileName,
          mimeType: signed.mimeType,
          fileSize: picked.fileSize,
        }, t('Could not register the upload'))
        patchUpload(id, { status: 'done', fileId: finalized.fileId })
      } catch (error) {
        console.error('[useAttachmentUpload] アップロードに失敗:', error)
        patchUpload(id, {
          status: 'error',
          error: error instanceof Error ? error.message : t('Upload failed'),
          retryFinalize: error instanceof AttachmentFinalizeError ? error.retryFinalize : undefined,
        })
      }
    },
    [channelId, patchUpload, t],
  )

  // 選んだ分の行を先にまとめて並べてから順に送る。途中の隙間で「アップロード中でない」状態になり、
  // 残りを置き去りにして送信できてしまうのを防ぐ。失敗した行は残り、エラーを見せる
  const uploadFiles = React.useCallback(
    async (pickedFiles: PickedFile[]) => {
      const ids = pickedFiles.map(() => uploadId())
      setUploads((current) => [
        ...current,
        ...pickedFiles.map((picked, i) => ({
          id: ids[i]!,
          channelId,
          fileName: picked.fileName,
          status: 'uploading' as const,
        })),
      ])
      for (const [i, picked] of pickedFiles.entries()) await uploadOne(picked, ids[i]!)
    },
    [channelId, uploadOne],
  )

  // 上限を超える選択は黙って切り捨てずエラーを見せる。枠が無いときはピッカーを開かない
  const alertAttachmentLimit = React.useCallback(() => {
    Alert.alert(
      t('Upload failed'),
      t('You can attach up to {count} files to one message', { count: MAX_MESSAGE_ATTACHMENTS }),
    )
  }, [t])

  const pickImage = React.useCallback(async () => {
    const remaining = remainingAttachmentSlots(uploads.length)
    if (remaining === 0) {
      alertAttachmentLimit()
      return
    }
    const result = await ImagePicker.launchImageLibraryAsync({
      mediaTypes: ['images'],
      allowsMultipleSelection: true,
      selectionLimit: remaining,
      quality: 0.9,
      // iPhone の HEIC をそのまま受け取ると添付の許可形式に無く弾かれるため、JPEG に変換された形で受け取る
      preferredAssetRepresentationMode:
        ImagePicker.UIImagePickerPreferredAssetRepresentationMode.Compatible,
    })
    if (result.canceled || !result.assets || result.assets.length === 0) return
    if (result.assets.length > remaining) {
      alertAttachmentLimit()
      return
    }
    await uploadFiles(
      result.assets.map((asset) => {
        const localFile = new File(asset.uri)
        return {
          uri: asset.uri,
          fileName: asset.fileName ?? localFile.name ?? 'image.jpg',
          mimeType: asset.mimeType ?? 'image/jpeg',
          fileSize: asset.fileSize ?? localFile.size,
        }
      }),
    )
  }, [alertAttachmentLimit, uploadFiles, uploads.length])

  const pickDocument = React.useCallback(async () => {
    if (remainingAttachmentSlots(uploads.length) === 0) {
      alertAttachmentLimit()
      return
    }
    const result = await DocumentPicker.getDocumentAsync({
      type: ALLOWED_DOCUMENT_TYPES,
      copyToCacheDirectory: true,
    })
    const asset = result.assets?.[0]
    if (result.canceled || !asset) return
    const localFile = new File(asset.uri)
    await uploadFiles([
      {
        uri: asset.uri,
        fileName: asset.name,
        mimeType: asset.mimeType ?? 'application/octet-stream',
        fileSize: asset.size ?? localFile.size,
      },
    ])
  }, [alertAttachmentLimit, uploadFiles, uploads.length])

  const removeUpload = React.useCallback((id: string) => {
    setUploads((current) => current.filter((upload) => upload.id !== id))
  }, [])
  const retryUpload = React.useCallback(async (id: string) => {
    const pending = uploads.find((upload) => upload.id === id)
    if (!pending?.retryFinalize || pending.channelId !== channelId) return
    patchUpload(id, { status: 'uploading' })
    try {
      const finalized = await pending.retryFinalize()
      patchUpload(id, { status: 'done', fileId: finalized.fileId, error: undefined, retryFinalize: undefined })
    } catch (error) {
      console.error('[useAttachmentUpload] finalize の再試行に失敗:', error)
      patchUpload(id, {
        status: 'error',
        error: error instanceof Error ? error.message : t('Upload failed'),
        retryFinalize: error instanceof AttachmentFinalizeError ? error.retryFinalize : pending.retryFinalize,
      })
    }
  }, [channelId, patchUpload, t, uploads])
  const clearUploads = React.useCallback(() => setUploads([]), [])
  const doneFileIds = uploads.flatMap((upload) =>
    upload.status === 'done' && upload.fileId ? [upload.fileId] : [],
  )

  return {
    uploads,
    pickImage,
    pickDocument,
    removeUpload,
    retryUpload,
    clearUploads,
    doneFileIds,
    isUploading: uploads.some((upload) => upload.status === 'uploading'),
    hasFailedUploads: hasFailedUploads(uploads),
  }
}
