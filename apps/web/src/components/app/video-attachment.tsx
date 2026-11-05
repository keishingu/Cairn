// Copyright 2026 Cairn Contributors
// SPDX-License-Identifier: Apache-2.0

'use client'

import React from 'react'
import { useT } from '@/components/locale-provider'

/**
 * 動画添付をブラウザ標準のプレイヤーで表示する。サムネイルは作らず、preload="metadata" で
 * 先頭フレームを代わりにする。本体は API が Storage の署名 URL へ転送し、Range 要求でシークできる。
 * HEVC の MOV など再生できない形式は、エラーを隠さず保存して見るよう案内する。
 */
export function VideoAttachment({
  fileId,
  fileName,
  maxWidth = 360,
}: {
  fileId: string
  fileName: string
  maxWidth?: number
}) {
  const t = useT()
  const [unplayable, setUnplayable] = React.useState(false)
  const downloadHref = `/api/attachments/${fileId}?download=1`

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 4, maxWidth }}>
      {unplayable ? (
        <div
          role="alert"
          style={{
            padding: '10px 12px',
            borderRadius: 8,
            background: 'var(--card-2)',
            border: '1px solid var(--border)',
            color: 'var(--text-3)',
            fontSize: 12.5,
          }}
        >
          {t('This video cannot be played in this browser. Download it to watch.')}
        </div>
      ) : (
        <video
          src={`/api/attachments/${fileId}`}
          controls
          playsInline
          preload="metadata"
          aria-label={fileName}
          onError={() => setUnplayable(true)}
          style={{
            width: '100%',
            maxHeight: 280,
            borderRadius: 8,
            background: '#000',
            display: 'block',
          }}
        />
      )}
      <a
        href={downloadHref}
        download={fileName}
        style={{
          fontSize: 11.5,
          color: 'var(--text-3)',
          overflow: 'hidden',
          textOverflow: 'ellipsis',
          whiteSpace: 'nowrap',
        }}
      >
        {t('Download {name}', { name: fileName })}
      </a>
    </div>
  )
}
