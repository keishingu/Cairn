// Copyright 2026 Cairn Contributors
// SPDX-License-Identifier: Apache-2.0

export const GALLERY_BUCKET = 'gallery'
export const GALLERY_ORIGINALS_BUCKET = 'gallery-originals'
// Supabase の署名付きアップロードURLの有効期間に合わせる。
export const UPLOAD_REQUEST_EXPIRY_MS = 2 * 60 * 60 * 1000
export const UPLOAD_REQUEST_EXPIRY_SAFETY_MS = 5 * 60 * 1000
export const UPLOAD_REQUEST_FALLBACK_EXPIRY_MS = 24 * 60 * 60 * 1000

export const GALLERY_IMAGE_MIME_TYPES = new Set([
  'image/jpeg',
  'image/png',
  'image/gif',
  'image/webp',
  'image/heic',
  'image/heif',
])

export function isGalleryImageMimeType(mimeType: string): boolean {
  return GALLERY_IMAGE_MIME_TYPES.has(mimeType)
}

export function galleryStoragePath(
  workspaceId: string,
  projectId: string,
  variant: 'original' | 'derived',
  extension: string,
): string {
  return `${workspaceId}/${projectId}/${variant}/${crypto.randomUUID()}.${safeExtension(extension)}`
}

export function isGalleryStoragePath(
  storagePath: string,
  workspaceId: string,
  projectId: string,
  variant: 'original' | 'derived',
): boolean {
  const escapedWorkspaceId = escapeRegex(workspaceId)
  const escapedProjectId = escapeRegex(projectId)
  return new RegExp(
    `^${escapedWorkspaceId}/${escapedProjectId}/${variant}/[0-9a-f-]+\\.[a-z0-9]+$`,
    'i',
  ).test(storagePath)
}

export function extensionForFile(fileName: string, mimeType: string): string {
  const extension = fileName.split('.').pop()?.toLowerCase()
  if (extension && /^[a-z0-9]+$/i.test(extension)) return extension

  switch (mimeType) {
    case 'image/jpeg':
      return 'jpg'
    case 'image/png':
      return 'png'
    case 'image/gif':
      return 'gif'
    case 'image/webp':
      return 'webp'
    case 'image/heic':
      return 'heic'
    case 'image/heif':
      return 'heif'
    default:
      return 'bin'
  }
}

function safeExtension(extension: string): string {
  return /^[a-z0-9]+$/i.test(extension) ? extension.toLowerCase() : 'bin'
}

function escapeRegex(value: string): string {
  return value.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')
}
