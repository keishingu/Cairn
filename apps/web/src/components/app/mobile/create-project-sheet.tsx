'use client'

import React from 'react'
import { useMutation, useQueryClient } from '@tanstack/react-query'
import { Icon } from '../primitives'
import type { ProjectDto } from '@/app/api/projects/route'
import type { PlacePhoto } from '@/app/api/places/photos/route'
import { fetchWithAuth } from '@/lib/fetch-with-auth'
import { LocationInput } from '../location-input'

async function createProject(body: {
  title: string
  description?: string | undefined
  startDate?: string | undefined
  endDate?: string | undefined
  coverPhotoUrl?: string | undefined
  location?: string | undefined
  placeId?: string | undefined
  placePhotoName?: string | undefined
}): Promise<ProjectDto> {
  const res = await fetchWithAuth('/api/projects', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
  })
  if (!res.ok) throw new Error('プロジェクトの作成に失敗しました')
  return res.json() as Promise<ProjectDto>
}

async function fetchPlacePhotos(placeId: string): Promise<PlacePhoto[]> {
  const res = await fetchWithAuth(`/api/places/photos?placeId=${encodeURIComponent(placeId)}`)
  if (!res.ok) return []
  return res.json() as Promise<PlacePhoto[]>
}

const inputStyle: React.CSSProperties = {
  width: '100%', height: 44, padding: '0 12px',
  border: '1px solid var(--border)',
  borderRadius: 10, background: 'var(--card-2)',
  color: 'var(--text)', fontSize: 15,
  fontFamily: 'inherit', outline: 'none',
  boxSizing: 'border-box',
}

const inputErrorStyle: React.CSSProperties = {
  ...inputStyle,
  border: '1px solid var(--red)',
}

interface CreateProjectSheetProps {
  onClose: () => void
  onCreated: (project: ProjectDto) => void
}

export function CreateProjectSheet({ onClose, onCreated }: CreateProjectSheetProps) {
  const queryClient = useQueryClient()

  const [title, setTitle] = React.useState('')
  const [description, setDescription] = React.useState('')
  const [startDate, setStartDate] = React.useState('')
  const [endDate, setEndDate] = React.useState('')
  const [location, setLocation] = React.useState('')
  const [placeId, setPlaceId] = React.useState('')
  const [placePhotos, setPlacePhotos] = React.useState<PlacePhoto[]>([])
  const [selectedPhotoName, setSelectedPhotoName] = React.useState<string | null>(null)
  const [photosLoading, setPhotosLoading] = React.useState(false)
  const [titleError, setTitleError] = React.useState('')
  const [endDateError, setEndDateError] = React.useState('')

  const titleRef = React.useRef<HTMLInputElement>(null)
  React.useEffect(() => { setTimeout(() => titleRef.current?.focus(), 150) }, [])

  const mutation = useMutation({
    mutationFn: createProject,
    onSuccess: (project) => {
      queryClient.setQueryData<ProjectDto[]>(['projects'], old => [project, ...(old ?? [])])
      onCreated(project)
      onClose()
    },
    onError: (err: Error) => setTitleError(err.message),
  })

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault()
    let hasError = false
    if (!title.trim()) {
      setTitleError('プロジェクト名を入力してください')
      hasError = true
    } else if (title.trim().length > 60) {
      setTitleError('60文字以内で入力してください')
      hasError = true
    } else {
      setTitleError('')
    }
    if (startDate && endDate && endDate < startDate) {
      setEndDateError('終了日は開始日以降にしてください')
      hasError = true
    } else {
      setEndDateError('')
    }
    if (hasError) return

    mutation.mutate({
      title: title.trim(),
      description: description.trim() || undefined,
      startDate: startDate || undefined,
      endDate: endDate || undefined,
      location: location.trim() || undefined,
      placeId: placeId || undefined,
      placePhotoName: selectedPhotoName ?? undefined,
    })
  }

  return (
    <>
      {/* Backdrop */}
      <div
        onClick={onClose}
        style={{
          position: 'fixed', inset: 0, zIndex: 300,
          background: 'rgba(0,0,0,0.4)',
        }}
      />

      {/* Sheet */}
      <div style={{
        position: 'fixed', left: 0, right: 0, bottom: 0, zIndex: 301,
        background: 'var(--card)',
        borderTopLeftRadius: 20, borderTopRightRadius: 20,
        boxShadow: '0 -4px 32px rgba(0,0,0,0.18)',
        maxHeight: '90dvh',
        display: 'flex', flexDirection: 'column',
        animation: 'slideUpSheet .22s cubic-bezier(.2,.7,.3,1)',
      }}>
        {/* Handle */}
        <div style={{ display: 'flex', justifyContent: 'center', padding: '12px 0 4px' }}>
          <div style={{ width: 36, height: 4, borderRadius: 2, background: 'var(--border-2)' }}/>
        </div>

        {/* Header */}
        <div style={{ display: 'flex', alignItems: 'center', padding: '4px 20px 14px', gap: 12 }}>
          <div style={{ width: 32, height: 32, borderRadius: 8, background: 'var(--accent-soft)', color: 'var(--accent-text)', display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0 }}>
            <Icon name="folder" size={16}/>
          </div>
          <div style={{ flex: 1 }}>
            <div style={{ fontSize: 16, fontWeight: 700, color: 'var(--text)' }}>新規プロジェクト</div>
            <div style={{ fontSize: 12, color: 'var(--text-3)', marginTop: 1 }}>基本情報を入力してください</div>
          </div>
          <button
            onClick={onClose}
            style={{ width: 30, height: 30, borderRadius: 8, border: 'none', background: 'var(--card-2)', color: 'var(--text-3)', cursor: 'pointer', display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0 }}
          >
            <Icon name="close" size={15}/>
          </button>
        </div>

        {/* Form */}
        <form onSubmit={handleSubmit} style={{ flex: 1, overflow: 'auto', padding: '0 20px', display: 'flex', flexDirection: 'column', gap: 18 }}>
          {/* Title */}
          <div>
            <div style={{ display: 'flex', alignItems: 'baseline', justifyContent: 'space-between', marginBottom: 6 }}>
              <label style={{ fontSize: 12.5, fontWeight: 600, color: 'var(--text-2)' }}>
                プロジェクト名 <span style={{ color: 'var(--red)' }}>*</span>
              </label>
              <span style={{ fontSize: 11, color: 'var(--text-4)' }}>{title.length}/60</span>
            </div>
            <input
              ref={titleRef}
              value={title}
              onChange={e => { setTitle(e.target.value); if (titleError) setTitleError('') }}
              placeholder="例: 新規顧客向け導入プロジェクト"
              style={titleError ? inputErrorStyle : inputStyle}
            />
            {titleError && (
              <div style={{ marginTop: 5, fontSize: 12, color: 'var(--red)', display: 'flex', alignItems: 'center', gap: 4 }}>
                <span style={{ width: 14, height: 14, borderRadius: '50%', background: 'var(--red)', color: '#fff', fontSize: 9, fontWeight: 700, display: 'inline-flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0 }}>!</span>
                {titleError}
              </div>
            )}
          </div>

          {/* Description */}
          <div>
            <div style={{ display: 'flex', alignItems: 'baseline', justifyContent: 'space-between', marginBottom: 6 }}>
              <label style={{ fontSize: 12.5, fontWeight: 600, color: 'var(--text-2)' }}>説明</label>
              <span style={{ fontSize: 11, color: 'var(--text-4)' }}>任意</span>
            </div>
            <textarea
              value={description}
              onChange={e => setDescription(e.target.value)}
              placeholder="目的・日程の概要・備考など"
              rows={3}
              style={{ ...inputStyle, height: 'auto', padding: '10px 12px', resize: 'none', lineHeight: 1.55 }}
            />
          </div>

          {/* Location */}
          <div>
            <div style={{ display: 'flex', alignItems: 'baseline', justifyContent: 'space-between', marginBottom: 6 }}>
              <label style={{ fontSize: 12.5, fontWeight: 600, color: 'var(--text-2)' }}>場所</label>
              <span style={{ fontSize: 11, color: 'var(--text-4)' }}>任意</span>
            </div>
            <LocationInput
              value={location}
              onSelect={(desc, pid) => {
                setLocation(desc)
                setPlaceId(pid)
                setPhotosLoading(true)
                fetchPlacePhotos(pid).then(photos => {
                  setPlacePhotos(photos)
                  if (photos.length > 0 && selectedPhotoName === null) {
                    setSelectedPhotoName(photos[0]!.photoName)
                  }
                }).finally(() => setPhotosLoading(false))
              }}
              onClear={() => {
                setLocation('')
                setPlaceId('')
                setPlacePhotos([])
                setSelectedPhotoName(null)
              }}
              inputStyle={inputStyle}
              placeholder="例: 東京都渋谷区、オンライン"
            />
          </div>

          {/* Cover photo */}
          <div>
            <div style={{ display: 'flex', alignItems: 'baseline', justifyContent: 'space-between', marginBottom: 8 }}>
              <label style={{ fontSize: 12.5, fontWeight: 600, color: 'var(--text-2)' }}>カバー写真</label>
              <span style={{ fontSize: 11, color: 'var(--text-4)' }}>任意</span>
            </div>

            {photosLoading ? (
              <div style={{ padding: '12px 14px', borderRadius: 10, background: 'var(--card-2)', border: '1px solid var(--border)', fontSize: 12, color: 'var(--text-3)', display: 'flex', alignItems: 'center', gap: 8 }}>
                <Icon name="loader" size={14}/>
                場所の写真を取得中…
              </div>
            ) : placePhotos.length === 0 ? (
              <div style={{ padding: '14px 16px', borderRadius: 10, background: 'var(--card-2)', border: '1px solid var(--border)', textAlign: 'center' }}>
                <Icon name="image" size={20} color="var(--text-4)"/>
                <div style={{ marginTop: 6, fontSize: 12, color: 'var(--text-3)' }}>
                  場所を入力すると自動で候補が表示されます
                </div>
              </div>
            ) : (
              <>
                <div style={{ display: 'flex', gap: 8, overflowX: 'auto', overflowY: 'hidden', padding: '2px 2px 8px', scrollbarWidth: 'none' }}>
                  <button
                    type="button"
                    onClick={() => setSelectedPhotoName(null)}
                    style={{
                      flexShrink: 0, width: 72, height: 56, borderRadius: 8,
                      border: `2px solid ${selectedPhotoName === null ? 'var(--accent)' : 'var(--border)'}`,
                      background: 'var(--card-2)', color: selectedPhotoName === null ? 'var(--accent-text)' : 'var(--text-3)',
                      cursor: 'pointer', fontSize: 10, fontWeight: 600, fontFamily: 'inherit',
                      display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', gap: 3,
                    }}
                  >
                    <Icon name="x" size={13}/>
                    自動
                  </button>

                  {placePhotos.map(photo => {
                    const selected = selectedPhotoName === photo.photoName
                    return (
                      <button
                        key={photo.photoName}
                        type="button"
                        onClick={() => setSelectedPhotoName(photo.photoName)}
                        style={{
                          flexShrink: 0, width: 96, height: 64, padding: 0,
                          borderRadius: 8, overflow: 'hidden', cursor: 'pointer',
                          border: `2px solid ${selected ? 'var(--accent)' : 'transparent'}`,
                          outline: selected ? 'none' : '1px solid var(--border)',
                          outlineOffset: -1,
                          background: 'transparent', position: 'relative',
                        }}
                      >
                        {/* eslint-disable-next-line @next/next/no-img-element */}
                        <img src={photo.thumbnailUri} alt="" style={{ width: '100%', height: '100%', objectFit: 'cover', display: 'block' }}/>
                        {selected && (
                          <div style={{ position: 'absolute', inset: 0, background: 'linear-gradient(180deg, transparent 0%, rgba(16,185,129,0.45) 100%)', display: 'flex', alignItems: 'flex-end', justifyContent: 'flex-end', padding: 5 }}>
                            <span style={{ width: 18, height: 18, borderRadius: '50%', background: 'var(--accent)', color: 'var(--on-accent)', display: 'inline-flex', alignItems: 'center', justifyContent: 'center' }}>
                              <Icon name="check" size={11} strokeWidth={3}/>
                            </span>
                          </div>
                        )}
                      </button>
                    )
                  })}
                </div>

                {selectedPhotoName && (() => {
                  const previewUrl = placePhotos.find(p => p.photoName === selectedPhotoName)?.thumbnailUri
                  if (!previewUrl) return null
                  return (
                    <div style={{ marginTop: 4, position: 'relative', borderRadius: 10, overflow: 'hidden', border: '1px solid var(--border)' }}>
                      {/* eslint-disable-next-line @next/next/no-img-element */}
                      <img src={previewUrl} alt="カバープレビュー" style={{ width: '100%', height: 80, objectFit: 'cover', display: 'block' }}/>
                      <div style={{ position: 'absolute', inset: 0, background: 'linear-gradient(180deg, transparent 40%, rgba(0,0,0,0.5) 100%)', display: 'flex', alignItems: 'flex-end', padding: '8px 10px' }}>
                        <span style={{ fontSize: 11.5, fontWeight: 700, color: '#fff', textShadow: '0 1px 2px rgba(0,0,0,0.5)', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                          {title || 'プロジェクト名'}
                        </span>
                      </div>
                    </div>
                  )
                })()}
              </>
            )}
          </div>

          {/* Dates */}
          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12 }}>
            <div>
              <label style={{ fontSize: 12.5, fontWeight: 600, color: 'var(--text-2)', display: 'block', marginBottom: 6 }}>開始日</label>
              <input
                type="date"
                value={startDate}
                onChange={e => setStartDate(e.target.value)}
                style={{ ...inputStyle, fontSize: 14 }}
              />
            </div>
            <div>
              <label style={{ fontSize: 12.5, fontWeight: 600, color: 'var(--text-2)', display: 'block', marginBottom: 6 }}>終了日</label>
              <input
                type="date"
                value={endDate}
                onChange={e => { setEndDate(e.target.value); if (endDateError) setEndDateError('') }}
                min={startDate || undefined}
                style={endDateError ? { ...inputStyle, fontSize: 14, border: '1px solid var(--red)' } : { ...inputStyle, fontSize: 14 }}
              />
              {endDateError && (
                <div style={{ marginTop: 4, fontSize: 11, color: 'var(--red)' }}>{endDateError}</div>
              )}
            </div>
          </div>

          {/* spacer for footer */}
          <div style={{ height: 8 }}/>
        </form>

        {/* Footer */}
        <div style={{
          padding: '12px 20px',
          paddingBottom: 'calc(12px + env(safe-area-inset-bottom))',
          borderTop: '1px solid var(--divider)',
          display: 'flex', gap: 10,
        }}>
          <button
            type="button"
            onClick={onClose}
            disabled={mutation.isPending}
            style={{
              flex: 1, height: 46, borderRadius: 12,
              border: '1px solid var(--border)', background: 'var(--card-2)',
              color: 'var(--text-2)', fontSize: 15, fontWeight: 600,
              cursor: 'pointer', fontFamily: 'inherit',
            }}
          >
            キャンセル
          </button>
          <button
            onClick={handleSubmit}
            disabled={mutation.isPending}
            style={{
              flex: 2, height: 46, borderRadius: 12,
              border: 'none',
              background: mutation.isPending ? 'var(--card-2)' : 'var(--accent)',
              color: mutation.isPending ? 'var(--text-4)' : 'var(--on-accent)',
              fontSize: 15, fontWeight: 700,
              cursor: mutation.isPending ? 'not-allowed' : 'pointer',
              fontFamily: 'inherit', transition: 'background 0.15s',
            }}
          >
            {mutation.isPending ? '作成中…' : '作成する'}
          </button>
        </div>
      </div>
    </>
  )
}
