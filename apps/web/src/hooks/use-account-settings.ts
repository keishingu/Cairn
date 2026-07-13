import { useMutation, useQueryClient } from '@tanstack/react-query'
import { fetchWithAuth } from '@/lib/fetch-with-auth'
import { processImageForUpload } from '@/lib/process-image'
import { useCurrentUser } from './use-current-user'

function isGifImage(file: File): boolean {
  return file.type === 'image/gif' || file.name.toLowerCase().endsWith('.gif')
}

function isPngImage(file: File): boolean {
  return file.type === 'image/png' || file.name.toLowerCase().endsWith('.png')
}

function isWebpImage(file: File): boolean {
  return file.type === 'image/webp' || file.name.toLowerCase().endsWith('.webp')
}

function hasPngSignature(bytes: Uint8Array): boolean {
  return (
    bytes.length >= 8
    && bytes[0] === 0x89
    && bytes[1] === 0x50
    && bytes[2] === 0x4e
    && bytes[3] === 0x47
    && bytes[4] === 0x0d
    && bytes[5] === 0x0a
    && bytes[6] === 0x1a
    && bytes[7] === 0x0a
  )
}

function readAscii(bytes: Uint8Array, offset: number, length: number): string {
  return String.fromCharCode(...bytes.slice(offset, offset + length))
}

async function isAnimatedPngImage(file: File): Promise<boolean> {
  if (!isPngImage(file)) return false

  const bytes = new Uint8Array(await file.arrayBuffer())
  if (!hasPngSignature(bytes)) return false

  const view = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength)
  let offset = 8
  while (offset + 8 <= bytes.length) {
    const chunkLength = view.getUint32(offset)
    const chunkType = readAscii(bytes, offset + 4, 4)
    if (chunkType === 'acTL') return true
    offset += 12 + chunkLength
  }

  return false
}

async function isAnimatedWebpImage(file: File): Promise<boolean> {
  if (!isWebpImage(file)) return false

  const bytes = new Uint8Array(await file.arrayBuffer())
  if (readAscii(bytes, 0, 4) !== 'RIFF' || readAscii(bytes, 8, 4) !== 'WEBP') return false

  const view = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength)
  let offset = 12
  while (offset + 8 <= bytes.length) {
    const chunkType = readAscii(bytes, offset, 4)
    const chunkLength = view.getUint32(offset + 4, true)
    const chunkDataOffset = offset + 8

    if (chunkType === 'ANIM') return true
    if (chunkType === 'VP8X' && chunkLength >= 1 && chunkDataOffset < bytes.length) {
      const featureFlags = bytes[chunkDataOffset] ?? 0
      if ((featureFlags & 0x02) !== 0) return true
    }

    offset = chunkDataOffset + chunkLength + (chunkLength % 2)
  }

  return false
}

async function isAnimatedAvatarImage(file: File): Promise<boolean> {
  return isGifImage(file) || await isAnimatedPngImage(file) || await isAnimatedWebpImage(file)
}

export function useAccountSettings() {
  return useCurrentUser()
}

export function useUpdateAccountDisplayName() {
  const queryClient = useQueryClient()

  return useMutation({
    mutationFn: async (displayName: string) => {
      const res = await fetchWithAuth('/api/me', {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ displayName }),
      })
      if (!res.ok) {
        const data = await res.json().catch(() => ({})) as { error?: string }
        throw new Error(data.error ?? '更新に失敗しました')
      }
    },
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: ['me'] })
      void queryClient.invalidateQueries({ queryKey: ['workspace-members'] })
    },
  })
}

export function useUploadAccountAvatar() {
  const queryClient = useQueryClient()

  return useMutation({
    mutationFn: async (file: File) => {
      if (await isAnimatedAvatarImage(file)) {
        throw new Error('アニメーション画像のアバターには未対応です。静止 JPEG / PNG / WebP / HEIC を選んでください')
      }

      let uploadFile = file
      try {
        uploadFile = (await processImageForUpload(file)).file
      } catch {
        throw new Error('画像の準備に失敗しました。別の写真でお試しください')
      }

      const formData = new FormData()
      formData.append('file', uploadFile)

      const res = await fetchWithAuth('/api/me/avatar', { method: 'POST', body: formData })
      if (!res.ok) {
        const data = await res.json().catch(() => ({})) as { error?: string }
        throw new Error(data.error ?? 'アップロードに失敗しました')
      }
    },
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: ['me'] })
      void queryClient.invalidateQueries({ queryKey: ['workspace-members'] })
    },
  })
}
