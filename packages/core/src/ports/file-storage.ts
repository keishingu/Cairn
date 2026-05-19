// Copyright 2026 Cairn Contributors
// SPDX-License-Identifier: Apache-2.0

export interface FileStorage {
  upload(params: {
    bucket: string
    path: string
    file: Blob | Buffer
    contentType: string
  }): Promise<{ path: string }>

  getPublicUrl(bucket: string, path: string): string

  remove(bucket: string, paths: string[]): Promise<void>
}
