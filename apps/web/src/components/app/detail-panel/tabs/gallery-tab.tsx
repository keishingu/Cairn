'use client'

import React from 'react'
import { useQuery, useQueryClient } from '@tanstack/react-query'
import { Icon } from '../../primitives'
import type { GalleryItemDto } from '@/app/api/projects/[id]/gallery/route'

interface UploadState {
  total: number
  done: number
  errors: string[]
}

async function uploadFile(projectId: string, file: File): Promise<void> {
  const fd = new FormData()
  fd.append('file', file)
  const res = await fetch(`/api/projects/${projectId}/gallery`, { method: 'POST', body: fd })
  if (!res.ok) {
    const data = await res.json().catch(() => ({})) as { error?: string }
    throw new Error(data.error ?? `${file.name} のアップロードに失敗しました`)
  }
}

export const GalleryTab = ({ projectId }: { projectId: string }) => {
  const queryClient = useQueryClient()
  const fileInputRef = React.useRef<HTMLInputElement>(null)
  const [hoveredId, setHoveredId] = React.useState<string | null>(null)
  const [lightboxUrl, setLightboxUrl] = React.useState<string | null>(null)
  const [uploadState, setUploadState] = React.useState<UploadState | null>(null)

  const { data: items = [], isLoading, isError } = useQuery<GalleryItemDto[]>({
    queryKey: ['project-gallery', projectId],
    queryFn: async () => {
      const res = await fetch(`/api/projects/${projectId}/gallery`)
      if (!res.ok) throw new Error('Failed to fetch gallery')
      return res.json() as Promise<GalleryItemDto[]>
    },
  })

  const handleFileChange = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const files = Array.from(e.target.files ?? [])
    e.target.value = ''
    if (files.length === 0) return

    setUploadState({ total: files.length, done: 0, errors: [] })

    const results = await Promise.allSettled(
      files.map(file =>
        uploadFile(projectId, file).then(() => {
          setUploadState(s => s ? { ...s, done: s.done + 1 } : s)
        })
      )
    )

    const errors = results
      .filter((r): r is PromiseRejectedResult => r.status === 'rejected')
      .map(r => r.reason instanceof Error ? r.reason.message : 'アップロードに失敗しました')

    setUploadState(s => s ? { ...s, errors } : s)
    void queryClient.invalidateQueries({ queryKey: ['project-gallery', projectId] })

    if (errors.length === 0) {
      setTimeout(() => setUploadState(null), 1500)
    }
  }

  const deleteItem = async (itemId: string) => {
    const res = await fetch(`/api/projects/${projectId}/gallery/${itemId}`, { method: 'DELETE' })
    if (!res.ok) throw new Error('削除に失敗しました')
    void queryClient.invalidateQueries({ queryKey: ['project-gallery', projectId] })
  }

  const isUploading = uploadState !== null && uploadState.done < uploadState.total

  if (isLoading) {
    return (
      <div style={{ flex: 1, display: 'flex', alignItems: 'center', justifyContent: 'center', color: 'var(--text-4)', fontSize: 13 }}>
        読み込み中...
      </div>
    )
  }

  if (isError) {
    return (
      <div style={{ flex: 1, display: 'flex', alignItems: 'center', justifyContent: 'center', color: 'var(--red-text)', fontSize: 13 }}>
        ギャラリーの取得に失敗しました
      </div>
    )
  }

  return (
    <>
      <div style={{ flex: 1, overflow: 'auto', padding: 10 }}>
        {/* アップロードボタン */}
        <div style={{ display: 'flex', justifyContent: 'flex-end', marginBottom: 8 }}>
          <input
            ref={fileInputRef}
            type="file"
            accept="image/jpeg,image/png,image/gif,image/webp,image/heic"
            multiple
            style={{ display: 'none' }}
            onChange={handleFileChange}
          />
          <button
            onClick={() => fileInputRef.current?.click()}
            disabled={isUploading}
            style={{
              display: 'inline-flex', alignItems: 'center', gap: 5,
              padding: '5px 10px', borderRadius: 7,
              border: '1px solid var(--border)',
              background: 'var(--card)', color: 'var(--text-2)',
              fontSize: 12, cursor: isUploading ? 'default' : 'pointer',
              fontFamily: 'inherit', opacity: isUploading ? 0.6 : 1,
            }}
          >
            <Icon name="upload" size={13}/>
            {isUploading
              ? `${uploadState.done}/${uploadState.total} 枚アップロード中...`
              : '写真を追加'}
          </button>
        </div>

        {uploadState?.errors && uploadState.errors.length > 0 && (
          <div style={{ marginBottom: 8, padding: '6px 10px', borderRadius: 6, background: 'var(--red-soft)', color: 'var(--red-text)', fontSize: 12, display: 'flex', flexDirection: 'column', gap: 2 }}>
            {uploadState.errors.map((err, i) => <span key={i}>{err}</span>)}
            <button
              onClick={() => setUploadState(null)}
              style={{ alignSelf: 'flex-end', marginTop: 4, fontSize: 11, background: 'none', border: 'none', color: 'var(--red-text)', cursor: 'pointer', textDecoration: 'underline', fontFamily: 'inherit' }}
            >
              閉じる
            </button>
          </div>
        )}

        {items.length === 0 && !isUploading ? (
          <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', gap: 8, padding: '40px 0', color: 'var(--text-4)' }}>
            <Icon name="image" size={28}/>
            <span style={{ fontSize: 13 }}>まだ写真がありません</span>
          </div>
        ) : (
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: 3 }}>
            {items.map(item => (
              <div
                key={item.id}
                style={{ position: 'relative', aspectRatio: '1/1', borderRadius: 5, overflow: 'hidden', cursor: 'pointer', background: 'var(--card-2)' }}
                onMouseEnter={() => setHoveredId(item.id)}
                onMouseLeave={() => setHoveredId(null)}
                onClick={() => setLightboxUrl(item.publicUrl)}
              >
                {/* eslint-disable-next-line @next/next/no-img-element */}
                <img
                  src={item.publicUrl}
                  alt=""
                  style={{ width: '100%', height: '100%', objectFit: 'cover', display: 'block' }}
                  loading="lazy"
                />
                {hoveredId === item.id && (
                  <button
                    onClick={e => {
                      e.stopPropagation()
                      if (!confirm('この写真を削除しますか？')) return
                      void deleteItem(item.id)
                    }}
                    style={{
                      position: 'absolute', top: 4, right: 4,
                      width: 24, height: 24, borderRadius: 6,
                      border: 'none', background: 'rgba(0,0,0,0.55)',
                      color: '#fff', cursor: 'pointer',
                      display: 'flex', alignItems: 'center', justifyContent: 'center',
                    }}
                  >
                    <Icon name="trash" size={12}/>
                  </button>
                )}
              </div>
            ))}
          </div>
        )}
      </div>

      {/* ライトボックス */}
      {lightboxUrl && (
        <div
          onClick={() => setLightboxUrl(null)}
          style={{
            position: 'fixed', inset: 0, zIndex: 200,
            background: 'rgba(0,0,0,0.85)',
            display: 'flex', alignItems: 'center', justifyContent: 'center',
          }}
        >
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img
            src={lightboxUrl}
            alt=""
            onClick={e => e.stopPropagation()}
            style={{ maxWidth: '90vw', maxHeight: '90vh', borderRadius: 8, objectFit: 'contain' }}
          />
          <button
            onClick={() => setLightboxUrl(null)}
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
    </>
  )
}
