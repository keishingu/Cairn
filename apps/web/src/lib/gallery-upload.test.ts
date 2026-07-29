// Copyright 2026 Cairn Contributors
// SPDX-License-Identifier: Apache-2.0

import { describe, expect, it } from 'vitest'
import { galleryStoragePath, isGalleryStoragePath } from './gallery-upload'

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
