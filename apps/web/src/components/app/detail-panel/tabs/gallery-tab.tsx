'use client'

import React from 'react'
import { useQuery, useQueryClient } from '@tanstack/react-query'
import { Icon } from '../../primitives'
import { ConfirmDialog } from '../../confirm-dialog'
import type { GalleryItemDto } from '@/app/api/projects/[id]/gallery/route'
import { processImageForUpload } from '@/lib/process-image'
import { fetchWithAuth } from '@/lib/fetch-with-auth'

interface UploadState {
  total: number
  done: number
  errors: string[]
}

async function uploadFile(projectId: string, original: File): Promise<void> {
  const { file, takenAt, latitude, longitude } = await processImageForUpload(original)
  const fd = new FormData()
  fd.append('file', file)
  if (takenAt) fd.append('takenAt', takenAt.toISOString())
  if (latitude !== null) fd.append('latitude', String(latitude))
  if (longitude !== null) fd.append('longitude', String(longitude))
  const res = await fetchWithAuth(`/api/projects/${projectId}/gallery`, { method: 'POST', body: fd })
  if (!res.ok) {
    const data = await res.json().catch(() => ({})) as { error?: string }
    throw new Error(data.error ?? `${original.name} のアップロードに失敗しました`)
  }
}

export const GalleryTab = ({ projectId }: { projectId: string }) => {
  const queryClient = useQueryClient()
  const fileInputRef = React.useRef<HTMLInputElement>(null)
  const [hoveredId, setHoveredId] = React.useState<string | null>(null)
  const [lightboxIndex, setLightboxIndex] = React.useState<number | null>(null)
  const [uploadState, setUploadState] = React.useState<UploadState | null>(null)
  const [deleteTargetId, setDeleteTargetId] = React.useState<string | null>(null)

  const { data: items = [], isLoading, isError } = useQuery<GalleryItemDto[]>({
    queryKey: ['project-gallery', projectId],
    queryFn: async () => {
      const res = await fetchWithAuth(`/api/projects/${projectId}/gallery`)
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
    const res = await fetchWithAuth(`/api/projects/${projectId}/gallery/${itemId}`, { method: 'DELETE' })
    if (!res.ok) throw new Error('削除に失敗しました')
    void queryClient.invalidateQueries({ queryKey: ['project-gallery', projectId] })
  }

  const isUploading = uploadState !== null && uploadState.done < uploadState.total

  const lightboxUrl = lightboxIndex !== null ? (items[lightboxIndex]?.publicUrl ?? null) : null
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
            accept="image/*"
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
                onClick={() => setLightboxIndex(items.indexOf(item))}
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
                      setDeleteTargetId(item.id)
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

      <ConfirmDialog
        open={deleteTargetId !== null}
        title="写真を削除"
        message="この写真を削除しますか？この操作は取り消せません。"
        onConfirm={async () => { if (deleteTargetId) await deleteItem(deleteTargetId) }}
        onClose={() => setDeleteTargetId(null)}
      />

      {/* ライトボックス */}
      {lightboxUrl && lightboxIndex !== null && (
        <div
          onClick={() => setLightboxIndex(null)}
          style={{
            position: 'fixed', inset: 0, zIndex: 200,
            background: 'rgba(0,0,0,0.85)',
            display: 'flex', alignItems: 'center', justifyContent: 'center',
          }}
        >
          {/* 画像 + 左右タップゾーン */}
          <div
            onClick={e => e.stopPropagation()}
            style={{ position: 'relative', maxWidth: '90vw', maxHeight: '90vh', display: 'flex' }}
          >
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img
              src={lightboxUrl}
              alt=""
              style={{ maxWidth: '90vw', maxHeight: '90vh', borderRadius: 8, objectFit: 'contain', display: 'block' }}
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

          {/* 枚数インジケーター */}
          <div style={{
            position: 'absolute', bottom: 20, left: '50%', transform: 'translateX(-50%)',
            fontSize: 12, color: 'rgba(255,255,255,0.7)',
            background: 'rgba(0,0,0,0.4)', padding: '4px 10px', borderRadius: 20,
          }}>
            {lightboxIndex + 1} / {items.length}
          </div>
        </div>
      )}
    </>
  )
}
