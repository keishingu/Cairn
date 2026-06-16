// Copyright 2026 Cairn Contributors
// SPDX-License-Identifier: Apache-2.0

'use client'

import React from 'react'
import { Icon } from './primitives'

export interface LightboxImage {
  /** リスト内で一意なキー（インデックス特定に使う） */
  key: string
  src: string
  alt?: string
  /** 下部に表示するキャプション（ファイル名など） */
  caption?: React.ReactNode
}

// ギャラリーと同じ Lightroom 風の拡大表示。チャット・ギャラリーで共用する
export const ImageLightbox = ({ images, index, onIndexChange, onClose }: {
  images: LightboxImage[]
  index: number
  onIndexChange: (i: number) => void
  onClose: () => void
}) => {
  const item = images[index] ?? null
  const goPrev = () => { if (index > 0) onIndexChange(index - 1) }
  const goNext = () => { if (index < images.length - 1) onIndexChange(index + 1) }

  React.useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'ArrowLeft') goPrev()
      else if (e.key === 'ArrowRight') goNext()
      else if (e.key === 'Escape') onClose()
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [index, images.length])

  if (!item) return null

  return (
    <div
      onClick={onClose}
      style={{
        position: 'fixed', inset: 0, zIndex: 200,
        background: 'rgba(0,0,0,0.9)',
        display: 'flex', alignItems: 'center', justifyContent: 'center',
      }}
    >
      <div
        onClick={e => e.stopPropagation()}
        style={{ position: 'relative', maxWidth: '90vw', maxHeight: '90vh', display: 'flex' }}
      >
        {/* eslint-disable-next-line @next/next/no-img-element */}
        <img
          src={item.src}
          alt={item.alt ?? ''}
          style={{ maxWidth: '90vw', maxHeight: '90vh', borderRadius: 10, objectFit: 'contain', display: 'block' }}
        />
        {/* 左タップゾーン（前へ） */}
        <div
          onClick={e => { e.stopPropagation(); goPrev() }}
          style={{
            position: 'absolute', left: 0, top: 0, bottom: 0, width: '40%',
            cursor: index > 0 ? 'w-resize' : 'default',
          }}
        />
        {/* 右タップゾーン（次へ） */}
        <div
          onClick={e => { e.stopPropagation(); goNext() }}
          style={{
            position: 'absolute', right: 0, top: 0, bottom: 0, width: '40%',
            cursor: index < images.length - 1 ? 'e-resize' : 'default',
          }}
        />
      </div>

      {/* メタ情報 */}
      {(item.caption || images.length > 1) && (
        <div style={{
          position: 'absolute', bottom: 24, left: '50%', transform: 'translateX(-50%)',
          display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 4,
          pointerEvents: 'none',
        }}>
          {item.caption && (
            <div style={{ fontSize: 12.5, fontWeight: 600, color: '#fff', textShadow: '0 1px 4px rgba(0,0,0,0.8)' }}>
              {item.caption}
            </div>
          )}
          {images.length > 1 && (
            <div style={{
              fontSize: 12, color: 'rgba(255,255,255,0.65)',
              background: 'rgba(0,0,0,0.4)', padding: '3px 10px', borderRadius: 20,
            }}>
              {index + 1} / {images.length}
            </div>
          )}
        </div>
      )}

      {/* 閉じるボタン */}
      <button
        onClick={onClose}
        style={{
          position: 'absolute', top: 16, right: 16,
          width: 36, height: 36, borderRadius: 10,
          border: 'none', background: 'rgba(255,255,255,0.15)',
          color: '#fff', cursor: 'pointer',
          display: 'flex', alignItems: 'center', justifyContent: 'center',
        }}
      >
        <Icon name="close" size={18}/>
      </button>
    </div>
  )
}
