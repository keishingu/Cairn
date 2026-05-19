// Copyright 2026 Cairn Contributors
// SPDX-License-Identifier: Apache-2.0

export type GalleryItem = {
  id: string
  projectId: string
  uploadedBy: string
  fileId: string
  caption: string | null
  takenAt: Date | null
  latitude: number | null
  longitude: number | null
  createdAt: Date
}
