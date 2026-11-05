// Copyright 2026 Cairn Contributors
// SPDX-License-Identifier: Apache-2.0

import { describe, expect, it } from 'vitest'
import {
  attachmentBucketForPath,
  groupAttachmentPathsByBucket,
  MAX_FILE_SIZE,
  MAX_VIDEO_FILE_SIZE,
  maxAttachmentFileSize,
  normalizeMimeType,
  resolveAttachmentMimeType,
  resolveFileType,
  resolveStorageExtension,
} from './attachments'

describe('添付ファイルのMIMEタイプ解決', () => {
  it('ブラウザがMIMEを返さないPDFは拡張子からapplication/pdfに補完する', () => {
    expect(resolveAttachmentMimeType('document.pdf', '')).toBe('application/pdf')
  })

  it('拡張子が無くても先頭バイトが %PDF ならapplication/pdfとして扱う', () => {
    const bytes = new TextEncoder().encode('%PDF-1.7\n...')

    expect(resolveAttachmentMimeType('三洋物産様向け提案資料_v0_1', 'application/octet-stream', bytes)).toBe('application/pdf')
  })

  it('拡張子もMIMEも中身も判別できない場合はnullを返す', () => {
    const bytes = new TextEncoder().encode('not a known signature')

    expect(resolveAttachmentMimeType('mystery_file', 'application/octet-stream', bytes)).toBeNull()
  })

  it('CSVの曖昧なMIMEタイプはtext/csvに正規化する', () => {
    expect(normalizeMimeType('data.csv', 'application/vnd.ms-excel')).toBe('text/csv')
  })

  it('拡張子が無いファイル名ではMIMEタイプから保存拡張子を補完する', () => {
    expect(resolveStorageExtension('三洋物産様向け提案資料_v0_1', 'application/pdf')).toBe('pdf')
  })
})

describe('動画添付の判定', () => {
  it('MP4・MOV・WebM を拡張子から動画として受け付ける', () => {
    expect(resolveAttachmentMimeType('clip.mp4', '')).toBe('video/mp4')
    expect(resolveAttachmentMimeType('IMG_0001.MOV', 'application/octet-stream')).toBe('video/quicktime')
    expect(resolveAttachmentMimeType('screen.webm', '')).toBe('video/webm')
  })

  it('対応外の動画形式は受け付けない', () => {
    expect(resolveAttachmentMimeType('clip.avi', 'video/x-msvideo')).toBeNull()
  })

  it('拡張子が無くても ftyp ボックスから MP4 と QuickTime を見分ける', () => {
    const mp4 = new Uint8Array([0, 0, 0, 0x20, 0x66, 0x74, 0x79, 0x70, 0x69, 0x73, 0x6f, 0x6d])
    const mov = new Uint8Array([0, 0, 0, 0x14, 0x66, 0x74, 0x79, 0x70, 0x71, 0x74, 0x20, 0x20])
    expect(resolveAttachmentMimeType('video', 'application/octet-stream', mp4)).toBe('video/mp4')
    expect(resolveAttachmentMimeType('video', 'application/octet-stream', mov)).toBe('video/quicktime')
  })

  it('動画だけ 500MiB まで、他の形式は 50MiB までにする', () => {
    expect(maxAttachmentFileSize('video/mp4')).toBe(MAX_VIDEO_FILE_SIZE)
    expect(MAX_VIDEO_FILE_SIZE).toBe(500 * 1024 * 1024)
    expect(maxAttachmentFileSize('application/pdf')).toBe(MAX_FILE_SIZE)
  })

  it('動画の files.file_type を video にする', () => {
    expect(resolveFileType('video/quicktime')).toBe('video')
  })
})

describe('添付の保存先バケット', () => {
  it('videos/ 配下だけを動画専用バケットにし、他は chat-attachments にする', () => {
    expect(attachmentBucketForPath('w/c/u/videos/a.mp4')).toBe('chat-videos')
    expect(attachmentBucketForPath('w/c/u/pdf-originals/a.pdf')).toBe('chat-attachments')
    expect(attachmentBucketForPath('w/c/u/a.png')).toBe('chat-attachments')
    // 4階層目以外の "videos" はバケットの判定に使わない
    expect(attachmentBucketForPath('w/videos/u/a.png')).toBe('chat-attachments')
  })

  it('削除対象のパスをバケットごとにまとめ、空と重複を除く', () => {
    expect(
      groupAttachmentPathsByBucket(['w/c/u/a.png', null, 'w/c/u/videos/b.mp4', 'w/c/u/a.png', undefined]),
    ).toEqual([
      { bucket: 'chat-attachments', paths: ['w/c/u/a.png'] },
      { bucket: 'chat-videos', paths: ['w/c/u/videos/b.mp4'] },
    ])
  })
})
