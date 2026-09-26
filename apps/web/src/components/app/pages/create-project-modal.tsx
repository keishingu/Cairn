'use client'

import React from 'react'
import { useQuery, useMutation } from '@tanstack/react-query'
import { Icon, StatusChip, Modal, ModalHeader, Field, fieldInputStyle, fieldTextareaStyle, onFocusRing, onBlurRing } from '../primitives'
import type { ProjectDto } from '@/app/api/projects/route'
import type { ProjectStatusDto } from '@/app/api/projects/statuses/route'
import type { WorkspaceMemberDto } from '@/app/api/workspaces/members/route'
import { LocationInput } from '../location-input'
import type { PlacePhoto } from '@/app/api/places/photos/route'
import { fetchWithAuth } from '@/lib/fetch-with-auth'
import { useT } from '@/components/locale-provider'

// ─── Tag presets ──────────────────────────────────────────────────
const TAG_PRESETS = [
  { id: 't1',  name: 'Traverse',         color: 'var(--blue)' },
  { id: 't2',  name: 'Day hike',       color: 'var(--emerald)' },
  { id: 't3',  name: 'Snow mountain',         color: 'var(--violet)' },
  { id: 't4',  name: 'Stream climb',       color: 'var(--blue)' },
  { id: 't5',  name: 'Climbing', color: 'var(--amber)' },
  { id: 't6',  name: 'Tent stay',     color: 'var(--rose)' },
  { id: 't7',  name: 'Training camp',         color: 'var(--violet)' },
  { id: 't8',  name: 'Workshop',       color: 'var(--amber)' },
  { id: 't9',  name: 'Beginner friendly',   color: 'var(--emerald)' },
  { id: 't10', name: 'Alumni meetup',       color: 'var(--text-3)' },
  { id: 't11', name: 'Gear upgrade',     color: 'var(--text-3)' },
  { id: 't12', name: 'Hazard: high',   color: 'var(--red)' },
] as const

// ─── Status chip selector ─────────────────────────────────────────
interface StatusChipSelectorProps {
  statuses: ProjectStatusDto[]
  value: string
  onChange: (v: string) => void
}

const StatusChipSelector = ({ statuses, value, onChange }: StatusChipSelectorProps) => (
  <div style={{ display: 'flex', flexWrap: 'wrap', gap: 6 }}>
    {statuses.map(s => {
      const selected = value === s.name
      return (
        <button key={s.id} type="button" onClick={() => onChange(s.name)} style={{
          display: 'inline-flex', alignItems: 'center', gap: 6,
          padding: '7px 12px', borderRadius: 999,
          border: `1.5px solid ${selected ? s.color : 'var(--border)'}`,
          background: selected ? s.color + '22' : 'var(--card)',
          color: selected ? 'var(--text)' : 'var(--text-2)',
          fontSize: 12, fontWeight: selected ? 700 : 500,
          fontFamily: 'inherit', cursor: 'pointer',
          transition: 'background .12s, border-color .12s',
        }}
          className={!selected ? 'hover-bg' : undefined}
        >
          <span style={{ width: 8, height: 8, borderRadius: '50%', background: s.color }}/>
          {s.name}
        </button>
      )
    })}
  </div>
)

// ─── Cover photo picker ───────────────────────────────────────────
interface CoverPickerProps {
  onPhotoNameChange: (name: string | null) => void
  placePhotos: PlacePhoto[]
  selectedPhotoName: string | null
}

const CoverPickerThumb = ({ selected, onClick, children }: { selected: boolean; onClick: () => void; children: React.ReactNode }) => (
  <button type="button" onClick={onClick} style={{
    flexShrink: 0, width: 96, height: 64, padding: 0,
    borderRadius: 8, overflow: 'hidden', cursor: 'pointer',
    border: `2px solid ${selected ? 'var(--accent)' : 'transparent'}`,
    outline: selected ? 'none' : '1px solid var(--border)',
    outlineOffset: -1,
    background: 'transparent', position: 'relative',
    transition: 'transform .1s, border-color .12s',
    transform: selected ? 'scale(1.02)' : 'scale(1)',
  }}>
    {children}
    {selected && (
      <div style={{ position: 'absolute', inset: 0, background: 'linear-gradient(180deg, transparent 0%, rgba(16,185,129,0.45) 100%)', display: 'flex', alignItems: 'flex-end', justifyContent: 'flex-end', padding: 5 }}>
        <span style={{ width: 18, height: 18, borderRadius: '50%', background: 'var(--accent)', color: 'var(--on-accent)', display: 'inline-flex', alignItems: 'center', justifyContent: 'center' }}>
          <Icon name="check" size={11} strokeWidth={3}/>
        </span>
      </div>
    )}
  </button>
)

const CoverPicker = ({ onPhotoNameChange, placePhotos, selectedPhotoName }: CoverPickerProps) => {
  const t = useT()
  if (placePhotos.length === 0) {
    return (
      <div style={{ padding: '12px 14px', borderRadius: 8, background: 'var(--card-2)', border: '1px solid var(--border)', display: 'flex', alignItems: 'center', gap: 10 }}>
        <Icon name="image" size={16} color="var(--text-4)"/>
        <div>
          <div style={{ fontSize: 12.5, fontWeight: 600, color: 'var(--text-2)' }}>{t('The cover photo is set automatically')}</div>
          <div style={{ fontSize: 11, color: 'var(--text-4)', marginTop: 2 }}>{t('Enter a place to choose a cover photo')}</div>
        </div>
      </div>
    )
  }

  return (
    <div>
      <div style={{ display: 'flex', gap: 6, marginBottom: 8 }}>
        <button
          type="button"
          onClick={() => onPhotoNameChange(null)}
          style={{
            flexShrink: 0, width: 72, height: 48, borderRadius: 8,
            border: `2px solid ${selectedPhotoName === null ? 'var(--accent)' : 'var(--border)'}`,
            background: 'var(--card-2)', color: selectedPhotoName === null ? 'var(--accent-text)' : 'var(--text-3)',
            cursor: 'pointer', fontSize: 10, fontWeight: 600, fontFamily: 'inherit',
            display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', gap: 3,
          }}
        >
          <Icon name="close" size={12}/>
          {t('Automatic')}
        </button>
      </div>

      <div style={{ position: 'relative' }}>
        <div style={{ display: 'flex', gap: 8, overflowX: 'auto', overflowY: 'hidden', padding: '2px 2px 8px', scrollbarWidth: 'thin' }}>
          {placePhotos.map(photo => {
            const selected = selectedPhotoName === photo.photoName
            return (
              <CoverPickerThumb key={photo.photoName} selected={selected} onClick={() => onPhotoNameChange(photo.photoName)}>
                {/* eslint-disable-next-line @next/next/no-img-element */}
                <img src={photo.thumbnailUri} alt="" style={{ width: '100%', height: '100%', objectFit: 'cover', display: 'block' }}/>
              </CoverPickerThumb>
            )
          })}
        </div>
        <div style={{ position: 'absolute', top: 0, right: 0, bottom: 8, width: 28, background: 'linear-gradient(90deg, transparent, var(--card-2))', pointerEvents: 'none' }}/>
      </div>
    </div>
  )
}

// ─── Tag picker ───────────────────────────────────────────────────
interface TagPreset {
  id: string
  name: string
  color: string
}

interface TagPickerProps {
  value: string[]
  onChange: (v: string[]) => void
  available?: readonly TagPreset[]
}

const TagPicker = ({ value, onChange, available = TAG_PRESETS }: TagPickerProps) => {
  const t = useT()
  const [open, setOpen] = React.useState(false)
  const selectedTags = available.filter(tag => value.includes(tag.id))
  const unselected   = available.filter(tag => !value.includes(tag.id))
  return (
    <div>
      <div style={{ display: 'flex', flexWrap: 'wrap', gap: 6, minHeight: 36, padding: '5px 6px', border: '1px solid var(--border)', borderRadius: 8, background: 'var(--card)' }}>
        {selectedTags.length === 0 && (
          <span style={{ padding: '5px 6px', fontSize: 12, color: 'var(--text-4)' }}>{t('Select tags (optional)')}</span>
        )}
        {selectedTags.map(tag => (
          <span key={tag.id} style={{ display: 'inline-flex', alignItems: 'center', gap: 5, padding: '3px 4px 3px 8px', borderRadius: 999, background: 'var(--card-2)', border: '1px solid var(--border)', fontSize: 11.5, fontWeight: 600, color: 'var(--text-2)' }}>
            <span style={{ width: 6, height: 6, borderRadius: '50%', background: tag.color }}/>
            {t(tag.name)}
            <button type="button" onClick={() => onChange(value.filter(id => id !== tag.id))} style={{ width: 16, height: 16, borderRadius: '50%', border: 'none', background: 'transparent', color: 'var(--text-3)', cursor: 'pointer', display: 'inline-flex', alignItems: 'center', justifyContent: 'center', padding: 0 }}>
              <Icon name="close" size={10} strokeWidth={2.5}/>
            </button>
          </span>
        ))}
        <button type="button" onClick={() => setOpen(o => !o)} style={{ display: 'inline-flex', alignItems: 'center', gap: 4, padding: '3px 9px', borderRadius: 999, background: open ? 'var(--accent-soft)' : 'transparent', border: `1px dashed ${open ? 'var(--accent)' : 'var(--border-2)'}`, color: open ? 'var(--accent-text)' : 'var(--text-3)', fontSize: 11.5, fontWeight: 600, cursor: 'pointer', fontFamily: 'inherit' }}>
          <Icon name="plus" size={11} strokeWidth={2.5}/> {t('Add')}
        </button>
      </div>
      {open && (
        <div style={{ marginTop: 8, padding: 10, borderRadius: 8, background: 'var(--card)', border: '1px solid var(--border)', maxHeight: 140, overflow: 'auto' }}>
          {unselected.length === 0 ? (
            <div style={{ padding: '6px 4px', fontSize: 11.5, color: 'var(--text-4)' }}>{t('All tags are selected')}</div>
          ) : (
            <div style={{ display: 'flex', flexWrap: 'wrap', gap: 6 }}>
              {unselected.map(tag => (
                <button key={tag.id} type="button" onClick={() => onChange([...value, tag.id])} style={{ display: 'inline-flex', alignItems: 'center', gap: 5, padding: '4px 9px', borderRadius: 999, background: 'var(--card-2)', border: '1px solid var(--border)', color: 'var(--text-2)', fontSize: 11.5, fontWeight: 500, cursor: 'pointer', fontFamily: 'inherit' }}
                  onMouseEnter={e => { const el = e.currentTarget as HTMLElement; el.style.background = 'var(--accent-soft)'; el.style.borderColor = 'var(--accent)'; el.style.color = 'var(--accent-text)' }}
                  onMouseLeave={e => { const el = e.currentTarget as HTMLElement; el.style.background = 'var(--card-2)'; el.style.borderColor = 'var(--border)'; el.style.color = 'var(--text-2)' }}
                >
                  <span style={{ width: 6, height: 6, borderRadius: '50%', background: tag.color }}/>{t(tag.name)}
                </button>
              ))}
            </div>
          )}
        </div>
      )}
    </div>
  )
}

interface MemberPickerProps {
  members: WorkspaceMemberDto[]
  value: string[]
  onChange: (v: string[]) => void
}

const MemberPicker = ({ members, value, onChange }: MemberPickerProps) => (
  <div style={{ display: 'flex', flexDirection: 'column', gap: 6, maxHeight: 210, overflow: 'auto', paddingRight: 2 }}>
    {members.map(member => {
      const selected = value.includes(member.userId)
      return (
        <button
          key={member.userId}
          type="button"
          onClick={() => onChange(selected ? value.filter(id => id !== member.userId) : [...value, member.userId])}
          title={member.email ?? undefined}
          style={{
            display: 'flex',
            alignItems: 'center',
            gap: 10,
            width: '100%',
            padding: '8px 10px',
            borderRadius: 10,
            border: `1.5px solid ${selected ? 'var(--accent)' : 'var(--border)'}`,
            background: selected ? 'var(--accent-soft)' : 'var(--card)',
            color: selected ? 'var(--accent-text)' : 'var(--text)',
            cursor: 'pointer',
            fontFamily: 'inherit',
            textAlign: 'left',
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
            <div style={{ fontSize: 12.5, fontWeight: 600, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
              {member.displayName}
            </div>
            {member.email && (
              <div style={{ fontSize: 11, color: 'var(--text-4)', marginTop: 1 }}>
                {member.email}
              </div>
            )}
          </div>
        </button>
      )
    })}
  </div>
)

// ─── API ──────────────────────────────────────────────────────────
async function fetchStatuses(): Promise<ProjectStatusDto[]> {
  const res = await fetchWithAuth('/api/projects/statuses')
  if (!res.ok) throw new Error('fetch failed')
  return res.json() as Promise<ProjectStatusDto[]>
}

async function createProject(body: {
  title: string
  description?: string | undefined
  statusId?: string | undefined
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

// ─── CreateProjectModal ───────────────────────────────────────────
export interface CreateProjectModalProps {
  onClose: () => void
  onCreated: (project: ProjectDto) => void
  initialStartDate?: string
  initialEndDate?: string
}

interface FormState {
  title: string
  description: string
  status: string
  startDate: string
  endDate: string
  tags: string[]
  location: string
  placeId: string
  selectedPhotoName: string | null
  memberUserIds: string[]
}

export const CreateProjectModal = ({ onClose, onCreated, initialStartDate, initialEndDate }: CreateProjectModalProps) => {
  const t = useT()
  const { data: statuses = [] } = useQuery({ queryKey: ['project-statuses'], queryFn: fetchStatuses })
  const { data: workspaceMembers = [] } = useQuery({ queryKey: ['workspace-members', 'active'], queryFn: fetchWorkspaceMembers })
  const [placePhotos, setPlacePhotos] = React.useState<PlacePhoto[]>([])
  const [photosLoading, setPhotosLoading] = React.useState(false)

  const [form, setForm] = React.useState<FormState>({
    title: '', description: '', status: '',
    startDate: initialStartDate ?? '', endDate: initialEndDate ?? '', tags: [],
    location: '', placeId: '', selectedPhotoName: null, memberUserIds: [],
  })

  React.useEffect(() => {
    if (statuses.length > 0 && form.status === '') {
      setForm(prev => ({ ...prev, status: statuses[0]!.name }))
    }
  }, [statuses]) // eslint-disable-line react-hooks/exhaustive-deps
  const [errors, setErrors] = React.useState<{ title?: string; endDate?: string }>({})
  const titleRef = React.useRef<HTMLInputElement>(null)

  React.useEffect(() => {
    setTimeout(() => titleRef.current?.focus(), 80)
  }, [])

  const set = <K extends keyof FormState>(k: K, v: FormState[K]) =>
    setForm(prev => ({ ...prev, [k]: v }))

  const clearError = (k: 'title' | 'endDate') =>
    setErrors(prev => { const next = { ...prev }; delete next[k]; return next })

  const mutation = useMutation({
    mutationFn: (body: Parameters<typeof createProject>[0]) => createProject(body, t),
    onSuccess: (project) => { onCreated(project); onClose() },
    onError: (err: Error) => setErrors(prev => ({ ...prev, title: err.message })),
  })

  const validate = () => {
    const e: { title?: string; endDate?: string } = {}
    if (!form.title.trim()) e.title = t('Enter a project name')
    else if (form.title.trim().length > 60) e.title = t('Enter 60 characters or fewer')
    if (form.startDate && form.endDate && form.endDate < form.startDate)
      e.endDate = t('End date must be on or after the start date')
    setErrors(e)
    return Object.keys(e).length === 0
  }

  const handleLocationSelect = React.useCallback(async (description: string, placeId: string) => {
    set('location', description)
    set('placeId', placeId)
    setPhotosLoading(true)
    try {
      const photos = await fetchPlacePhotos(placeId)
      setPlacePhotos(photos)
      if (photos.length > 0 && form.selectedPhotoName === null) {
        set('selectedPhotoName', photos[0]!.photoName)
      }
    } finally {
      setPhotosLoading(false)
    }
  }, [form.selectedPhotoName]) // eslint-disable-line react-hooks/exhaustive-deps

  const handleLocationClear = () => {
    set('location', '')
    set('placeId', '')
    set('selectedPhotoName', null)
    setPlacePhotos([])
  }

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault()
    if (!validate()) return
    const selectedStatus = statuses.find(s => s.name === form.status)
    mutation.mutate({
      title: form.title.trim(),
      description: form.description.trim() || undefined,
      statusId: selectedStatus?.id,
      startDate: form.startDate || undefined,
      endDate: form.endDate || undefined,
      location: form.location.trim() || undefined,
      placeId: form.placeId || undefined,
      placePhotoName: form.selectedPhotoName ?? undefined,
      memberUserIds: form.memberUserIds.length > 0 ? form.memberUserIds : undefined,
    })
  }

  return (
    <Modal onClose={onClose}>
      <form onSubmit={handleSubmit} style={{
        position: 'relative',
        width: '100%', maxWidth: 960,
        maxHeight: 'calc(100vh - 48px)',
        background: 'var(--card)',
        borderRadius: 14,
        boxShadow: 'var(--shadow-lg)',
        display: 'flex', flexDirection: 'column',
        overflow: 'hidden',
      }}>
        <ModalHeader icon="folder" title={t('New project')} subtitle={t('Create a unit you track, such as a client engagement or an internal project')} onClose={onClose}/>

        {/* Body — 2 columns */}
        <div style={{ flex: 1, minHeight: 0, overflow: 'auto', display: 'grid', gridTemplateColumns: 'minmax(0, 1.15fr) 360px' }}>
          {/* Left — basic info */}
          <div style={{ padding: '20px 22px', display: 'flex', flexDirection: 'column', gap: 18 }}>
            <Field label={t('Project name')} required error={errors.title} hint={`${form.title.length}/60`} htmlFor="cpm-title">
              <input id="cpm-title" ref={titleRef}
                value={form.title}
                onChange={e => { set('title', e.target.value); if (errors.title) clearError('title') }}
                placeholder={t('e.g. New customer rollout')}
                style={fieldInputStyle(!!errors.title)}
                onFocus={onFocusRing}
                onBlur={e => onBlurRing(e, !!errors.title)}
              />
            </Field>

            <Field label={t('Description')} hint={t('Optional — visible to members')} htmlFor="cpm-desc">
              <textarea id="cpm-desc"
                value={form.description}
                onChange={e => set('description', e.target.value)}
                placeholder={t('Purpose, schedule, and notes')}
                rows={5}
                style={fieldTextareaStyle(false)}
                onFocus={onFocusRing}
                onBlur={e => onBlurRing(e, false)}
              />
            </Field>

            <Field label={t('Location')} hint={t('Optional')} htmlFor="cpm-location">
              <LocationInput
                value={form.location}
                onSelect={(desc, pid) => { void handleLocationSelect(desc, pid) }}
                onClear={handleLocationClear}
                inputStyle={fieldInputStyle(false)}
                placeholder={t('e.g. Shibuya, Tokyo, or online')}
              />
            </Field>

            <Field label={t('Status')} required>
              <StatusChipSelector statuses={statuses} value={form.status} onChange={v => set('status', v)}/>
            </Field>
          </div>

          {/* Right — meta */}
          <div style={{ padding: '20px 22px', borderLeft: '1px solid var(--divider)', background: 'var(--card-2)', display: 'flex', flexDirection: 'column', gap: 18 }}>
            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 10 }}>
              <Field label={t('Start date')} htmlFor="cpm-start">
                <input id="cpm-start" type="date"
                  value={form.startDate}
                  onChange={e => set('startDate', e.target.value)}
                  style={{ ...fieldInputStyle(false), background: 'var(--card)' }}
                  onFocus={onFocusRing}
                  onBlur={e => onBlurRing(e, false)}
                />
              </Field>
              <Field label={t('End date')} error={errors.endDate} htmlFor="cpm-end">
                <input id="cpm-end" type="date"
                  value={form.endDate}
                  onChange={e => { set('endDate', e.target.value); if (errors.endDate) clearError('endDate') }}
                  min={form.startDate || undefined}
                  style={{ ...fieldInputStyle(!!errors.endDate), background: 'var(--card)' }}
                  onFocus={onFocusRing}
                  onBlur={e => onBlurRing(e, !!errors.endDate)}
                />
              </Field>
            </div>

            <Field label={t('Tags')} hint={t('{count} selected', { count: form.tags.length })}>
              <TagPicker value={form.tags} onChange={v => set('tags', v)}/>
            </Field>

            <Field label={t('Members')} hint={form.memberUserIds.length > 0 ? t('{count} selected members', { count: form.memberUserIds.length }) : t('Optional')}>
              {workspaceMembers.length === 0 ? (
                <div style={{ padding: '12px 14px', borderRadius: 8, background: 'var(--card)', border: '1px solid var(--border)', fontSize: 12, color: 'var(--text-4)' }}>
                  {t('Loading people to add…')}
                </div>
              ) : (
                <MemberPicker members={workspaceMembers} value={form.memberUserIds} onChange={v => set('memberUserIds', v)}/>
              )}
            </Field>

            <Field label={t('Cover photo')} hint={t('Shown in the list and panel')}>
              {photosLoading && (
                <div style={{ padding: '10px 14px', borderRadius: 8, background: 'var(--card-2)', border: '1px solid var(--border)', fontSize: 12, color: 'var(--text-3)', display: 'flex', alignItems: 'center', gap: 8 }}>
                  <Icon name="loader" size={14}/>
                  {t('Loading place photos…')}
                </div>
              )}
              {!photosLoading && (
                <CoverPicker
                  onPhotoNameChange={v => set('selectedPhotoName', v)}
                  placePhotos={placePhotos}
                  selectedPhotoName={form.selectedPhotoName}
                />
              )}
              {(() => {
                const previewUrl = form.selectedPhotoName
                  ? placePhotos.find(p => p.photoName === form.selectedPhotoName)?.thumbnailUri
                  : null
                if (!previewUrl) return null
                return (
                  <div style={{ marginTop: 10, position: 'relative', borderRadius: 8, overflow: 'hidden', border: '1px solid var(--border)' }}>
                    {/* eslint-disable-next-line @next/next/no-img-element */}
                    <img src={previewUrl} alt={t('Cover')} style={{ width: '100%', height: 90, objectFit: 'cover', display: 'block' }}/>
                    <div style={{ position: 'absolute', inset: 0, background: 'linear-gradient(180deg, rgba(0,0,0,0) 40%, rgba(0,0,0,0.55) 100%)', display: 'flex', alignItems: 'flex-end', padding: '8px 10px', gap: 8 }}>
                      <span style={{ fontSize: 12, fontWeight: 700, color: '#fff', textShadow: '0 1px 2px rgba(0,0,0,0.5)', flex: 1, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                        {form.title || t('Project name')}
                      </span>
                      {form.status && (() => {
                        const s = statuses.find(x => x.name === form.status)
                        return s ? <StatusChip name={s.name} color={s.color}/> : null
                      })()}
                    </div>
                  </div>
                )
              })()}
            </Field>
          </div>
        </div>

        {/* Footer */}
        <footer style={{ padding: '12px 20px', borderTop: '1px solid var(--divider)', background: 'var(--card)', display: 'flex', alignItems: 'center', gap: 10 }}>
          <span style={{ fontSize: 11.5, color: 'var(--text-3)', display: 'inline-flex', alignItems: 'center', gap: 6 }}>
            <Icon name="users" size={12}/>
            {t('You can also add members when you create this')}
          </span>
          <div style={{ flex: 1 }}/>
          <button type="button" onClick={onClose} className="btn" disabled={mutation.isPending}>{t('Cancel')}</button>
          <button type="submit" className="btn btn-primary" disabled={mutation.isPending} style={{ opacity: mutation.isPending ? 0.7 : 1 }}>
            {mutation.isPending ? t('Creating…') : t('Create')}
          </button>
        </footer>
      </form>
    </Modal>
  )
}
