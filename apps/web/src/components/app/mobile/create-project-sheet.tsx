'use client'

import React from 'react'
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { Icon, sheetFieldInputStyle } from '../primitives'
import type { ProjectDto } from '@/app/api/projects/route'
import type { PlacePhoto } from '@/app/api/places/photos/route'
import type { WorkspaceMemberDto } from '@/app/api/workspaces/members/route'
import { fetchWithAuth } from '@/lib/fetch-with-auth'
import { LocationInput } from '../location-input'
import { useT } from '@/components/locale-provider'
import { MobileFormSheet } from './form-sheet'
import { DateRangePicker } from './date-range-sheet'

async function createProject(body: {
  title: string
  description?: string | undefined
  startDate?: string | undefined
  endDate?: string | undefined
  coverPhotoUrl?: string | undefined
  location?: string | undefined
  placeId?: string | undefined
  placePhotoName?: string | undefined
  memberUserIds?: string[] | undefined
}, t: (message: string, values?: Record<string, string | number>) => string): Promise<ProjectDto> {
  const res = await fetchWithAuth('/api/projects', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
  })
  if (!res.ok) throw new Error(t('Could not create the project'))
  return res.json() as Promise<ProjectDto>
}

async function fetchPlacePhotos(placeId: string): Promise<PlacePhoto[]> {
  const res = await fetchWithAuth(`/api/places/photos?placeId=${encodeURIComponent(placeId)}`)
  if (!res.ok) return []
  return res.json() as Promise<PlacePhoto[]>
}

async function fetchWorkspaceMembers(): Promise<WorkspaceMemberDto[]> {
  const res = await fetchWithAuth('/api/workspaces/members?status=active')
  if (!res.ok) throw new Error('fetch failed')
  return res.json() as Promise<WorkspaceMemberDto[]>
}

const inputStyle = sheetFieldInputStyle(false)

const inputErrorStyle: React.CSSProperties = {
  ...inputStyle,
  border: '1px solid var(--red)',
}

interface CreateProjectSheetProps {
  onClose: () => void
  onCreated: (project: ProjectDto) => void
  initialStartDate?: string
  initialEndDate?: string
}

export function CreateProjectSheet({ onClose, onCreated, initialStartDate = '', initialEndDate = '' }: CreateProjectSheetProps) {
  const t = useT()
  const queryClient = useQueryClient()
  const { data: workspaceMembers = [] } = useQuery({ queryKey: ['workspace-members', 'active'], queryFn: fetchWorkspaceMembers })

  const [title, setTitle] = React.useState('')
  const [description, setDescription] = React.useState('')
  const [startDate, setStartDate] = React.useState(initialStartDate)
  const [endDate, setEndDate] = React.useState(initialEndDate)
  const [location, setLocation] = React.useState('')
  const [placeId, setPlaceId] = React.useState('')
  const [placePhotos, setPlacePhotos] = React.useState<PlacePhoto[]>([])
  const [selectedPhotoName, setSelectedPhotoName] = React.useState<string | null>(null)
  const [memberUserIds, setMemberUserIds] = React.useState<string[]>([])
  const [photosLoading, setPhotosLoading] = React.useState(false)
  const [titleError, setTitleError] = React.useState('')
  const [endDateError, setEndDateError] = React.useState('')

  // 開いた直後に自動でフォーカスしない。開くアニメーション中にキーボードが出ると iOS がシートを持ち上げられず、
  // 作成ボタンがキーボードの裏に隠れる（入力欄を押した時は持ち上がる）

  const mutation = useMutation({
    mutationFn: (body: Parameters<typeof createProject>[0]) => createProject(body, t),
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
      setTitleError(t('Enter a project name'))
      hasError = true
    } else if (title.trim().length > 60) {
      setTitleError(t('Enter 60 characters or fewer'))
      hasError = true
    } else {
      setTitleError('')
    }
    if (startDate && endDate && endDate < startDate) {
      setEndDateError(t('End date must be on or after the start date'))
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
      memberUserIds: memberUserIds.length > 0 ? memberUserIds : undefined,
    })
  }

  return (
    <MobileFormSheet
      icon="folder"
      title={t('New project')}
      subtitle={t('Enter the basics')}
      onClose={onClose}
      onSubmit={handleSubmit}
      submitLabel={t('Create')}
      submittingLabel={t('Creating…')}
      isSubmitting={mutation.isPending}
      disableClose={mutation.isPending}
    >
      {/* Title */}
      <div>
        <div style={{ display: 'flex', alignItems: 'baseline', justifyContent: 'space-between', marginBottom: 6 }}>
          <label style={{ fontSize: 'var(--fs-md)', fontWeight: 600, color: 'var(--text-2)' }}>
            {t('Project name')} <span style={{ color: 'var(--red)' }}>*</span>
          </label>
          <span style={{ fontSize: 'var(--fs-xs)', color: 'var(--text-4)' }}>{title.length}/60</span>
        </div>
        <input
          value={title}
          onChange={e => { setTitle(e.target.value); if (titleError) setTitleError('') }}
          placeholder={t('e.g. New customer rollout')}
          style={titleError ? inputErrorStyle : inputStyle}
        />
        {titleError && (
          <div style={{ marginTop: 5, fontSize: 'var(--fs-sm)', color: 'var(--red)', display: 'flex', alignItems: 'center', gap: 4 }}>
            <span style={{ width: 14, height: 14, borderRadius: '50%', background: 'var(--red)', color: '#fff', fontSize: 'var(--fs-2xs)', fontWeight: 600, display: 'inline-flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0 }}>!</span>
            {titleError}
          </div>
        )}
      </div>

      {/* Description */}
      <div>
        <div style={{ display: 'flex', alignItems: 'baseline', justifyContent: 'space-between', marginBottom: 6 }}>
          <label style={{ fontSize: 'var(--fs-md)', fontWeight: 600, color: 'var(--text-2)' }}>{t('Description')}</label>
          <span style={{ fontSize: 'var(--fs-xs)', color: 'var(--text-4)' }}>{t('Optional')}</span>
        </div>
        <textarea
          value={description}
          onChange={e => setDescription(e.target.value)}
          placeholder={t('Purpose, schedule, and notes')}
          rows={3}
          style={{ ...inputStyle, height: 'auto', padding: '10px 12px', resize: 'none', lineHeight: 1.55 }}
        />
      </div>

      {/* Location */}
      <div>
        <div style={{ display: 'flex', alignItems: 'baseline', justifyContent: 'space-between', marginBottom: 6 }}>
          <label style={{ fontSize: 'var(--fs-md)', fontWeight: 600, color: 'var(--text-2)' }}>{t('Location')}</label>
          <span style={{ fontSize: 'var(--fs-xs)', color: 'var(--text-4)' }}>{t('Optional')}</span>
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
          placeholder={t('e.g. Shibuya, Tokyo, or online')}
        />
      </div>

      {/* Cover photo */}
      <div>
        <div style={{ display: 'flex', alignItems: 'baseline', justifyContent: 'space-between', marginBottom: 8 }}>
          <label style={{ fontSize: 'var(--fs-md)', fontWeight: 600, color: 'var(--text-2)' }}>{t('Cover photo')}</label>
          <span style={{ fontSize: 'var(--fs-xs)', color: 'var(--text-4)' }}>{t('Optional')}</span>
        </div>

        {photosLoading ? (
          <div style={{ padding: '12px 14px', borderRadius: 10, background: 'var(--card-2)', border: '1px solid var(--border)', fontSize: 'var(--fs-sm)', color: 'var(--text-3)', display: 'flex', alignItems: 'center', gap: 8 }}>
            <Icon name="loader" size={14}/>
            {t('Loading place photos…')}
          </div>
        ) : placePhotos.length === 0 ? (
          <div style={{ padding: '14px 16px', borderRadius: 10, background: 'var(--card-2)', border: '1px solid var(--border)', textAlign: 'center' }}>
            <Icon name="image" size={20} color="var(--text-4)"/>
            <div style={{ marginTop: 6, fontSize: 'var(--fs-sm)', color: 'var(--text-3)' }}>
              {t('Enter a place and photo suggestions appear')}
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
                  cursor: 'pointer', fontSize: 'var(--fs-2xs)', fontWeight: 600, fontFamily: 'inherit',
                  display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', gap: 3,
                }}
              >
                <Icon name="close" size={13}/>
                {t('Automatic')}
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
                  <img src={previewUrl} alt={t('Cover preview')} style={{ width: '100%', height: 80, objectFit: 'cover', display: 'block' }}/>
                  <div style={{ position: 'absolute', inset: 0, background: 'linear-gradient(180deg, transparent 40%, rgba(0,0,0,0.5) 100%)', display: 'flex', alignItems: 'flex-end', padding: '8px 10px' }}>
                    <span style={{ fontSize: 'var(--fs-sm)', fontWeight: 600, color: '#fff', textShadow: '0 1px 2px rgba(0,0,0,0.5)', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                      {title || t('Project name')}
                    </span>
                  </div>
                </div>
              )
            })()}
          </>
        )}
      </div>

      <div>
        <div style={{ display: 'flex', alignItems: 'baseline', justifyContent: 'space-between', marginBottom: 8 }}>
          <label style={{ fontSize: 'var(--fs-md)', fontWeight: 600, color: 'var(--text-2)' }}>{t('Members')}</label>
          <span style={{ fontSize: 'var(--fs-xs)', color: 'var(--text-4)' }}>{memberUserIds.length > 0 ? t('{count} selected members', { count: memberUserIds.length }) : t('Optional')}</span>
        </div>
        <div style={{ display: 'flex', flexDirection: 'column', gap: 6, maxHeight: 220, overflow: 'auto' }}>
          {workspaceMembers.map(member => {
            const selected = memberUserIds.includes(member.userId)
            return (
              <button
                key={member.userId}
                type="button"
                onClick={() => setMemberUserIds(current => selected ? current.filter(id => id !== member.userId) : [...current, member.userId])}
                style={{
                  display: 'flex',
                  alignItems: 'center',
                  gap: 10,
                  width: '100%',
                  padding: '10px 12px',
                  borderRadius: 10,
                  border: `1.5px solid ${selected ? 'var(--accent)' : 'var(--border)'}`,
                  background: selected ? 'var(--accent-soft)' : 'var(--card-2)',
                  color: selected ? 'var(--accent-text)' : 'var(--text)',
                  textAlign: 'left',
                  fontFamily: 'inherit',
                  cursor: 'pointer',
                }}
              >
                <div style={{
                  width: 16,
                  height: 16,
                  borderRadius: '50%',
                  border: `2px solid ${selected ? 'var(--accent)' : 'var(--border-2)'}`,
                  background: selected ? 'var(--accent)' : 'transparent',
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'center',
                  flexShrink: 0,
                }}>
                  {selected && <Icon name="check" size={9} color="var(--on-accent)"/>}
                </div>
                <div style={{ minWidth: 0, flex: 1 }}>
                  <div style={{ fontSize: 'var(--fs-md)', fontWeight: 600, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                    {member.displayName}
                  </div>
                  {member.email && (
                    <div style={{ fontSize: 'var(--fs-xs)', color: 'var(--text-4)', marginTop: 1 }}>
                      {member.email}
                    </div>
                  )}
                </div>
              </button>
            )
          })}
        </div>
      </div>

      {/* Dates: 日程の編集と同じカレンダーで選ぶ */}
      <div>
        <div style={{ fontSize: 'var(--fs-md)', fontWeight: 600, color: 'var(--text-2)', marginBottom: 8 }}>{t('Dates')}</div>
        <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
          <DateRangePicker
            value={{ start: startDate || null, end: endDate || null, startTime: '', endTime: '' }}
            onChange={v => { setStartDate(v.start ?? ''); setEndDate(v.end ?? ''); if (endDateError) setEndDateError('') }}
          />
        </div>
        {endDateError && (
          <div style={{ marginTop: 4, fontSize: 'var(--fs-xs)', color: 'var(--red)' }}>{endDateError}</div>
        )}
      </div>
    </MobileFormSheet>
  )
}
