// Copyright 2026 Cairn Contributors
// SPDX-License-Identifier: Apache-2.0

import { describe, expect, it } from 'vitest'
import { galleryStoragePath, isGalleryStoragePath, normalizeGalleryImageMimeType } from './gallery-upload'

describe('galleryStoragePath', () => {
  const workspaceId = '11111111-1111-1111-1111-111111111111'
  const projectId = '22222222-2222-2222-2222-222222222222'

  it('ワークスペース・プロジェクト・種別ごとにランダムな保存先を作る', () => {
    const path = galleryStoragePath(workspaceId, projectId, 'derived', 'JPG')

    expect(path).toMatch(new RegExp(`^${workspaceId}/${projectId}/derived/[0-9a-f-]+\\.jpg$`))
    expect(isGalleryStoragePath(path, workspaceId, projectId, 'derived')).toBe(true)
  })

  it('別のワークスペース・プロジェクト・種別の保存先を拒否する', () => {
    const path = `${workspaceId}/${projectId}/original/11111111-1111-1111-1111-111111111111.jpg`

    expect(isGalleryStoragePath(path, workspaceId, projectId, 'derived')).toBe(false)
    expect(isGalleryStoragePath(path, '33333333-3333-3333-3333-333333333333', projectId, 'original')).toBe(false)
  })
})

describe('ギャラリー画像の MIME 補完（normalizeGalleryImageMimeType）', () => {
  it('ブラウザが MIME を判定できなかった HEIC は、拡張子から補う', () => {
    expect(normalizeGalleryImageMimeType('IMG_0001.HEIC', '')).toBe('image/heic')
    expect(normalizeGalleryImageMimeType('IMG_0001.heif', 'application/octet-stream')).toBe('image/heif')
    expect(normalizeGalleryImageMimeType('photo.jpeg', '')).toBe('image/jpeg')
  })

  it('判定できている MIME と、拡張子から分からないものは書き換えない', () => {
    expect(normalizeGalleryImageMimeType('IMG_0001.heic', 'image/jpeg')).toBe('image/jpeg')
    expect(normalizeGalleryImageMimeType('archive.zip', '')).toBe('')
    expect(normalizeGalleryImageMimeType('noextension', '')).toBe('')
  })
})
