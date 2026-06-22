'use client'

import React from 'react'
import { useQuery } from '@tanstack/react-query'
import { Icon } from '../primitives'
import { TopBar } from '../sidebar'
import { ImageLightbox, type LightboxImage } from '../image-lightbox'
import type { WorkspaceGalleryItemDto } from '@/app/api/gallery/route'
import { fetchWithAuth } from '@/lib/fetch-with-auth'

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
      const res = await fetchWithAuth('/api/gallery')
      if (!res.ok) throw new Error('Failed to fetch gallery')
      return res.json() as Promise<WorkspaceGalleryItemDto[]>
    },
  })

  const lightboxImages = React.useMemo<LightboxImage[]>(() => items.map(it => ({
    key: it.id,
    src: it.publicUrl,
    caption: it.projectTitle,
    meta: formatDate(it.takenAt, it.createdAt),
  })), [items])

  return (
    <div style={{ flex: 1, display: 'flex', flexDirection: 'column', minHeight: 0 }}>
      {/* PC ヘッダー */}
      {!isMobile && (
        <TopBar title="ギャラリー" subtitle={items.length > 0 ? `${items.length} 枚` : null}/>
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
      {lightboxIndex !== null && lightboxImages.length > 0 && (
        <ImageLightbox
          images={lightboxImages}
          index={Math.min(lightboxIndex, lightboxImages.length - 1)}
          onIndexChange={setLightboxIndex}
          onClose={() => setLightboxIndex(null)}
        />
      )}
    </div>
  )
}
