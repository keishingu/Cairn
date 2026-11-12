// Copyright 2026 Cairn Contributors
// SPDX-License-Identifier: Apache-2.0

'use client'

import React from 'react'
import { useT } from '@/components/locale-provider'
import { useUploadRights } from '@/hooks/use-upload-rights'

/**
 * 動画添付をブラウザ標準のプレイヤーで表示する。サムネイルは作らず、preload="metadata" で
 * 先頭フレームを代わりにする。本体は API が Storage の署名 URL へ転送し、Range 要求でシークできる。
 * 再生・保存は全員が圧縮版（720p の H.264。変換中は原本）で、原本の保存は Solo 支援者本人だけ。
 * 再生できない形式（変換前の HEVC など）は、エラーを隠さず保存して見るよう案内する。
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
  const uploadRights = useUploadRights()
  const canDownloadOriginal = uploadRights.data?.canDownloadOriginal === true

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
            fontSize: 13,
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
      <div style={{ display: 'flex', gap: 10, minWidth: 0, fontSize: 12 }}>
        <a
          href={downloadHref}
          download={fileName}
          style={{ color: 'var(--text-3)', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap', minWidth: 0 }}
        >
          {t('Download {name}', { name: fileName })}
        </a>
        {canDownloadOriginal && (
          <a href={`/api/attachments/${fileId}?original=1`} download={fileName} style={{ color: 'var(--text-3)', flexShrink: 0 }}>
            {t('Download original')}
          </a>
        )}
      </div>
      {/* 支援状態を取れないときは「原本なし」として黙って隠さず、失敗を見せて再試行させる */}
      {uploadRights.isError && (
        <div role="alert" style={{ display: 'flex', alignItems: 'center', gap: 6, fontSize: 12, color: 'var(--red-text)' }}>
          <span>{t('Could not check whether you can download original files.')}</span>
          <button
            type="button"
            className="btn btn-xs"
            disabled={uploadRights.isFetching}
            onClick={() => void uploadRights.refetch()}
          >
            {t('Retry')}
          </button>
        </div>
      )}
    </div>
  )
}
