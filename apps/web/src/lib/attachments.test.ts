// Copyright 2026 Cairn Contributors
// SPDX-License-Identifier: Apache-2.0

import { describe, expect, it } from 'vitest'
import { normalizeMimeType, resolveAttachmentMimeType, resolveStorageExtension } from './attachments'

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
