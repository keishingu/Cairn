// Copyright 2026 Cairn Contributors
// SPDX-License-Identifier: Apache-2.0

import type { UploadGalleryItemInput } from '@cairn/shared'
import type { GalleryItem } from '../domain/index.js'
import type { FileStorage } from '../ports/index.js'

export interface GalleryRepository {
  create(input: UploadGalleryItemInput & { uploadedBy: string }): Promise<GalleryItem>
}

export class UploadGalleryItemUseCase {
  constructor(
    private readonly galleryRepo: GalleryRepository,
    private readonly fileStorage: FileStorage,
  ) {}

  async execute(
    input: UploadGalleryItemInput & { uploadedBy: string },
  ): Promise<GalleryItem> {
    return this.galleryRepo.create(input)
  }
}
