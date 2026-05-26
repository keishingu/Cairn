'use client'

import React from 'react'
import { useQuery } from '@tanstack/react-query'
import { Icon } from '../primitives'
import type { WorkspaceGalleryItemDto } from '@/app/api/gallery/route'

function formatDate(takenAt: string | null, createdAt: string): string {
  if (takenAt) {
    const d = new Date(takenAt)
    return `${d.getMonth() + 1}/${d.getDate()} ${String(d.getHours()).padStart(2, '0')}:${String(d.getMinutes()).padStart(2, '0')}`
  }
  const d = new Date(createdAt)
  return `${d.getMonth() + 1}/${d.getDate()}`
}

export const PageGallery = ({ isMobile = false }: { isMobile?: boolean }) => {
  const [lightboxIndex, setLightboxIndex] = React.useState<number | null>(null)

  const { data: items = [], isLoading, isError } = useQuery<WorkspaceGalleryItemDto[]>({
    queryKey: ['workspace-gallery'],
    queryFn: async () => {
      const res = await fetch('/api/gallery')
      if (!res.ok) throw new Error('Failed to fetch gallery')
      return res.json() as Promise<WorkspaceGalleryItemDto[]>
    },
  })

  const lightboxItem = lightboxIndex !== null ? items[lightboxIndex] ?? null : null
  const goPrev = () => setLightboxIndex(i => i !== null && i > 0 ? i - 1 : i)
  const goNext = () => setLightboxIndex(i => i !== null && i < items.length - 1 ? i + 1 : i)

  React.useEffect(() => {
    if (lightboxIndex === null) return
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'ArrowLeft') goPrev()
      else if (e.key === 'ArrowRight') goNext()
      else if (e.key === 'Escape') setLightboxIndex(null)
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [lightboxIndex, items.length])

  return (
    <div style={{ flex: 1, display: 'flex', flexDirection: 'column', minHeight: 0 }}>
      {/* PC ヘッダー */}
      {!isMobile && (
        <div style={{ padding: '20px 24px 0', flexShrink: 0 }}>
          <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 16 }}>
            <div>
              <h2 style={{ margin: 0, fontSize: 22, fontWeight: 700, letterSpacing: '-0.02em' }}>ギャラリー</h2>
              {items.length > 0 && (
                <div style={{ fontSize: 12.5, color: 'var(--text-3)', marginTop: 2 }}>
                  {items.length} 枚
                </div>
              )}
            </div>
          </div>
        </div>
      )}

      {/* コンテンツ */}
      <div style={{
        flex: 1, overflow: 'auto',
        padding: isMobile ? `6px 10px calc(80px + env(safe-area-inset-bottom))` : '0 24px 24px',
      }}>
        {isLoading && (
          <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', padding: '60px 0', color: 'var(--text-4)', fontSize: 13 }}>
            読み込み中...
          </div>
        )}

        {isError && (
          <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', padding: '60px 0', color: 'var(--red-text)', fontSize: 13 }}>
            ギャラリーの取得に失敗しました
          </div>
        )}

        {!isLoading && !isError && items.length === 0 && (
          <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', gap: 10, padding: '80px 0', color: 'var(--text-4)' }}>
            <Icon name="image" size={36}/>
            <span style={{ fontSize: 14 }}>まだ写真がありません</span>
            <span style={{ fontSize: 12.5, color: 'var(--text-4)' }}>プロジェクトのギャラリータブから写真を追加してください</span>
          </div>
        )}

        {items.length > 0 && (
          <div style={{ columnCount: isMobile ? 2 : 4, columnGap: isMobile ? 6 : 12 }}>
            {items.map((item, idx) => (
              <div
                key={item.id}
                style={{
                  breakInside: 'avoid', marginBottom: 12,
                  borderRadius: 10, overflow: 'hidden',
                  background: 'var(--card)', border: '1px solid var(--border)',
                  boxShadow: 'var(--shadow-sm)', cursor: 'pointer',
                  transition: 'transform .15s, box-shadow .15s',
                }}
                onMouseEnter={e => {
                  ;(e.currentTarget as HTMLElement).style.transform = 'translateY(-2px)'
                  ;(e.currentTarget as HTMLElement).style.boxShadow = 'var(--shadow-md)'
                }}
                onMouseLeave={e => {
                  ;(e.currentTarget as HTMLElement).style.transform = 'translateY(0)'
                  ;(e.currentTarget as HTMLElement).style.boxShadow = 'var(--shadow-sm)'
                }}
                onClick={() => setLightboxIndex(idx)}
              >
                {/* eslint-disable-next-line @next/next/no-img-element */}
                <img
                  src={item.publicUrl}
                  alt=""
                  style={{ width: '100%', display: 'block' }}
                  loading="lazy"
                />
                <div style={{ padding: '8px 10px' }}>
                  <div style={{ fontSize: 11.5, fontWeight: 600, color: 'var(--text-2)', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                    {item.projectTitle}
                  </div>
                  <div style={{ fontSize: 11, color: 'var(--text-4)', marginTop: 2 }}>
                    {formatDate(item.takenAt, item.createdAt)}
                  </div>
                </div>
              </div>
            ))}
          </div>
        )}
      </div>

      {/* ライトボックス */}
      {lightboxItem && lightboxIndex !== null && (
        <div
          onClick={() => setLightboxIndex(null)}
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
              src={lightboxItem.publicUrl}
              alt=""
              style={{ maxWidth: '90vw', maxHeight: '90vh', borderRadius: 10, objectFit: 'contain', display: 'block' }}
            />
            {/* 左タップゾーン（前へ） */}
            <div
              onClick={e => { e.stopPropagation(); goPrev() }}
              style={{
                position: 'absolute', left: 0, top: 0, bottom: 0, width: '40%',
                cursor: lightboxIndex > 0 ? 'w-resize' : 'default',
              }}
            />
            {/* 右タップゾーン（次へ） */}
            <div
              onClick={e => { e.stopPropagation(); goNext() }}
              style={{
                position: 'absolute', right: 0, top: 0, bottom: 0, width: '40%',
                cursor: lightboxIndex < items.length - 1 ? 'e-resize' : 'default',
              }}
            />
          </div>

          {/* メタ情報 */}
          <div style={{
            position: 'absolute', bottom: 24, left: '50%', transform: 'translateX(-50%)',
            display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 4,
            pointerEvents: 'none',
          }}>
            <div style={{ fontSize: 12.5, fontWeight: 600, color: '#fff', textShadow: '0 1px 4px rgba(0,0,0,0.8)' }}>
              {lightboxItem.projectTitle}
            </div>
            <div style={{
              fontSize: 12, color: 'rgba(255,255,255,0.65)',
              background: 'rgba(0,0,0,0.4)', padding: '3px 10px', borderRadius: 20,
            }}>
              {lightboxIndex + 1} / {items.length} · {formatDate(lightboxItem.takenAt, lightboxItem.createdAt)}
            </div>
          </div>

          {/* 閉じるボタン */}
          <button
            onClick={() => setLightboxIndex(null)}
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
      )}
    </div>
  )
}
