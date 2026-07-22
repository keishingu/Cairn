import React from 'react'
import * as DocumentPicker from 'expo-document-picker'
import * as ImagePicker from 'expo-image-picker'
import { File } from 'expo-file-system'
import { apiFetch } from '../lib/api-fetch'
import { supabase } from '../lib/supabase'

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
  fileName: string
  status: 'uploading' | 'done' | 'error'
  fileId?: string
  error?: string
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
  const [uploads, setUploads] = React.useState<PendingUpload[]>([])

  const patchUpload = React.useCallback((id: string, patch: Partial<PendingUpload>) => {
    setUploads((current) =>
      current.map((upload) => (upload.id === id ? { ...upload, ...patch } : upload)),
    )
  }, [])

  const uploadFile = React.useCallback(
    async (picked: PickedFile) => {
      const id = uploadId()
      setUploads((current) => [
        ...current,
        {
          id,
          fileName: picked.fileName,
          status: 'uploading',
        },
      ])

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
          throw await responseError(signResponse, 'アップロードの準備に失敗しました')
        const signed = (await signResponse.json()) as SignedUploadDto

        const file = new File(picked.uri)
        const bytes = await file.arrayBuffer()
        const { error: storageError } = await supabase.storage
          .from('chat-attachments')
          .uploadToSignedUrl(signed.storagePath, signed.token, bytes, {
            contentType: signed.mimeType,
          })
        if (storageError) throw storageError

        const finalizeResponse = await apiFetch('/api/attachments/finalize', {
          method: 'POST',
          body: JSON.stringify({
            channelId,
            storagePath: signed.storagePath,
            fileName: picked.fileName,
            mimeType: signed.mimeType,
            fileSize: picked.fileSize,
          }),
        })
        if (!finalizeResponse.ok)
          throw await responseError(finalizeResponse, 'アップロードの登録に失敗しました')
        const finalized = (await finalizeResponse.json()) as { fileId: string }
        patchUpload(id, { status: 'done', fileId: finalized.fileId })
      } catch (error) {
        console.error('[useAttachmentUpload] アップロードに失敗:', error)
        patchUpload(id, {
          status: 'error',
          error: error instanceof Error ? error.message : 'アップロードに失敗しました',
        })
      }
    },
    [channelId, patchUpload],
  )

  const pickImage = React.useCallback(async () => {
    const result = await ImagePicker.launchImageLibraryAsync({
      mediaTypes: ['images'],
      quality: 0.9,
    })
    const asset = result.assets?.[0]
    if (result.canceled || !asset) return
    const localFile = new File(asset.uri)
    await uploadFile({
      uri: asset.uri,
      fileName: asset.fileName ?? localFile.name ?? 'image.jpg',
      mimeType: asset.mimeType ?? 'image/jpeg',
      fileSize: asset.fileSize ?? localFile.size,
    })
  }, [uploadFile])

  const pickDocument = React.useCallback(async () => {
    const result = await DocumentPicker.getDocumentAsync({
      type: ALLOWED_DOCUMENT_TYPES,
      copyToCacheDirectory: true,
    })
    const asset = result.assets?.[0]
    if (result.canceled || !asset) return
    const localFile = new File(asset.uri)
    await uploadFile({
      uri: asset.uri,
      fileName: asset.name,
      mimeType: asset.mimeType ?? 'application/octet-stream',
      fileSize: asset.size ?? localFile.size,
    })
  }, [uploadFile])

  const removeUpload = React.useCallback((id: string) => {
    setUploads((current) => current.filter((upload) => upload.id !== id))
  }, [])
  const clearUploads = React.useCallback(() => setUploads([]), [])
  const doneFileIds = uploads.flatMap((upload) =>
    upload.status === 'done' && upload.fileId ? [upload.fileId] : [],
  )

  return {
    uploads,
    pickImage,
    pickDocument,
    removeUpload,
    clearUploads,
    doneFileIds,
    isUploading: uploads.some((upload) => upload.status === 'uploading'),
  }
}
